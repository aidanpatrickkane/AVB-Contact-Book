# this holds fastapi app
import os
from datetime import datetime
from typing import Annotated

import psycopg
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, status, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, EmailStr, StringConstraints, field_validator

load_dotenv()
DATABASE_URL = os.environ["DATABASE_URL"] # crash right away if missing

app = FastAPI(title="Contact Book")

def get_conn():
    with psycopg.connect(DATABASE_URL, autocommit=True, row_factory=dict_row) as conn: # need clarification here
        yield conn

Conn = Annotated[psycopg.Connection, Depends(get_conn)] # when an endpoint says conn: Conn, that calls get_conn, creating the database connection and allowing the endpoint to use it

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] # matches check constraint in db

class ContactIn(BaseModel): # this is what the client is allowed to send. If a request doesnt match, FastAPI returns 422 with message saying the wrong field before endpoint code event runs
    first_name: Name
    last_name: Name
    emails: list[EmailStr] = []

    @field_validator("emails") # after the initial type checks pass, like all the emails are valid emails, run this function. whatever the function reutrns becomes the final value. If valueerror is raised, the request gets a 422
    @classmethod
    def no_duplicate_emails(cls, emails: list[str]) -> list[str]:
        seen = set()
        for email in emails:
            if email.lower() in seen: 
                raise ValueError(f"{email} is listed more than once")
            seen.add(email.lower())
        return emails
    
class ContactOut(BaseModel): # this is what the api sends back
    id: int
    first_name: str
    last_name: str
    emails: list[str]
    created_at: datetime
    updated_at: datetime

# this creates one row per contact with an emails list, which is the shape of ContactOut. ordering by id keeps them in the order the user added them in
CONTACT_SELECT = """
    SELECT c.id, c.first_name, c.last_name, c.created_at, c.updated_at,
        COALESCE(
            array_agg(e.address ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL),
            '{}'
        ) AS emails
    FROM contacts c
    LEFT JOIN emails e ON e.contact_id = c.id
"""

# ENDPOINTS BEGIN

# create a contact
@app.post("/api/contacts", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
def create_contact(contact: ContactIn, conn: Conn): # fastapi reads json body, checks against contactin, hands us clean object
    with conn.transaction(): # If anything inside raises an error, both inserts are rolled back.
        new = conn.execute(
            "INSERT INTO contacts (first_name, last_name) VALUES (%s, %s) "
            "RETURNING id, first_name, last_name, created_at, updated_at", # RETURNING makes Postgres send back the new row,
            (contact.first_name, contact.last_name), # with parameterized queries, the sql text is read by postgres first, so it already knows the shape of the query, and then fills in the values as plain data
        ).fetchone()

        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO emails (contact_id, address) VALUES (%s, %s)", # placeholders prevents sql injection
                [(new["id"], email) for email in contact.emails], # tuple is built per email, (7, "email@example.com") and then inserted
            )
    return {**new, "emails": contact.emails}

# get all contacts
@app.get("/api/contacts", response_model=list[ContactOut])
def list_contacts(conn: Conn):
    return conn.execute(
        CONTACT_SELECT + " GROUP BY c.id ORDER BY lower(c.first_name), lower(c.last_name), c.id"
    ).fetchall()

# get a particular contact
@app.get("/api/contacts/{contact_id}", response_model=ContactOut)
def get_contact(contact_id: int, conn: Conn):
    return fetch_contact(conn, contact_id)

# update
@app.put("/api/contacts/{contact_id}", response_model=ContactOut)
def update_contact(contact_id: int, contact: ContactIn, conn: Conn):
    with conn.transaction():
        updated = conn.execute(
            "UPDATE contacts SET first_name = %s, last_name = %s, updated_at = now() " # needs to happen manually because sql only does it on inserts
            "WHERE id = %s RETURNING id",
            (contact.first_name, contact.last_name, contact_id),
        ).fetchone()
        if updated is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")

        conn.execute("DELETE FROM emails WHERE contact_id = %s", (contact_id,)) # why are we deleting
        with conn.cursor() as cur:
            cur.executemany(
                "INSERT INTO emails (contact_id, address) VALUES (%s, %s)",
                [(contact_id, email) for email in contact.emails],
            )
    return fetch_contact(conn, contact_id)

@app.delete("/api/contacts/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(contact_id: int, conn: Conn):
    deleted = conn.execute("DELETE FROM contacts WHERE id = %s", (contact_id,))
    if deleted.rowcount == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")

def fetch_contact(conn: psycopg.Connection, contact_id: int) -> dict:
    contact = conn.execute(
        CONTACT_SELECT + " WHERE c.id = %s GROUP BY c.id",
        (contact_id,),
    ).fetchone() # returns None if none found
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    return contact

@app.get("/api/health")
def health():
    with psycopg.connect(DATABASE_URL) as conn:
        conn.execute("SELECT 1")
    return {"status": "ok"}


# create endpoint needs
## pydantic model describing what a valid request body looks like, a database dependency that opens and connection for each request and closes it afterwards, and the insert into contacts, getting the new id back and inserting each email using that id