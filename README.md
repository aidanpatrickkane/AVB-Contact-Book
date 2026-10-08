# Contact Book

A contact manager where you can list, view, add, edit, search and delete contacts. Each contact can have any number of email addresses.

- **Frontend:** vanilla HTML, CSS and JavaScript (no frameworks, no build step)
- **Backend:** Python + FastAPI (REST API)
- **Database:** Postgres on Neon
- **Hosting:** Vercel

The design follows the Figma mockup, including both Figma comments:
1. The email delete button (⊖) appears on hover.
2. Clicking "add email" shows an input for the new email.

## Features

**Required**
- List contacts (sorted by first name), view, add, edit and delete them
- Multiple emails per contact
- First and last name are required, and validated in the browser, the API and the database

**User-centric extra features, added with real use in mind**
- **Search** by name or email, for when the sidebar gets long
- **Save and Cancel act on a draft.** Email adds and removals only happen when you click Save, so Cancel really undoes everything.
- **Unsaved-changes protection.** Switching contacts or closing the tab with unsaved edits asks first.
- **Delete confirmation** that says exactly who is being deleted
- **Instant validation messages** under each field, plus clear messages if the server rejects something
- **Duplicate checks:** the same email can't be added twice to one contact (case-insensitive). A same-name contact shows a hint but is allowed, since two people can share a name.
- **Double-save protection.** The Save button is disabled and shows "Saving…" while a request is in progress.
- **Loading, empty, "no search results" and error states**
- **Accessibility:**
  - Real buttons and labels, so it works with the keyboard
  - Visible focus outlines
  - Screen-reader labels on the icon buttons
  - Errors and toasts are announced
  - The ⊖ button also shows on keyboard focus, and always on touch screens (which can't hover)
- **Layout for phones:** below 700px the list stacks above the form

## Project structure

```
app.py              FastAPI app: API endpoints, validation, database access
schema.sql          Database tables (contacts, emails)
requirements.txt    Python packages
public/
  index.html        Page structure
  styles.css        Styling
  api.js            All calls to the API, in one place
  app.js            UI state, rendering and event handling
```

## Database

```
contacts                         emails
--------                         ------
id (PK)            1 ───────< *  id (PK)
first_name                       contact_id (FK → contacts.id, ON DELETE CASCADE)
last_name                        address
created_at                       created_at
updated_at
```

- **Two tables**, because a contact has many emails (one-to-many). The foreign key sits on the "many" side.
- **`ON DELETE CASCADE`**: deleting a contact deletes its emails.
- **A unique index on `(contact_id, lower(address))`** stops the same contact from having the same email twice, ignoring case. It also makes looking up a contact's emails fast.
- **`CHECK` constraints** require non-blank names of at most 100 characters, so bad data can't get in even if something skips the API.

## API

| Method | Path | Does | Success |
|---|---|---|---|
| GET | `/api/contacts` | List all contacts with their emails | 200 |
| GET | `/api/contacts/{id}` | Get one contact | 200 |
| POST | `/api/contacts` | Create a contact | 201 |
| PUT | `/api/contacts/{id}` | Replace a contact (names and the full email list) | 200 |
| DELETE | `/api/contacts/{id}` | Delete a contact | 204 |
| GET | `/api/health` | Check that the app can reach the database | 200 |

Errors: **404** if the contact doesn't exist, and **422** if the input is invalid (with a message for each field).

## Deployment

The app is on Vercel with the FastAPI framework preset. The Neon integration provides `DATABASE_URL`, with production pointing at Neon's `main` branch and local development at a separate `dev` branch. Pushing to `main` deploys to production.

## Design decisions and trade-offs

- **Validation happens in three layers.**
  - The browser checks input for instant feedback.
  - The API checks it because it can't trust any client.
  - The database checks it as the last line of defence.

  The limits match in all three places.
- **Saving a contact is one atomic transaction.** The contact and its emails are saved together or not at all, so there's never half-saved data.
- **PUT replaces the whole email list.** This matches the single Save button: the form holds the complete contact, and the database is made to match it. Emails are deleted and re-inserted rather than compared one by one.
- **Parameterized SQL** (`%s` placeholders) everywhere, so user input can never run as SQL.
- **User data is always rendered with `textContent`**, never `innerHTML`, which prevents XSS.
- **State, then render.** All UI data lives in one `state` object. Every change updates the state, then re-renders from it.
- **One database connection per request.** This suits serverless hosting, and it uses Neon's pooled connection string.
- **The same email on two different contacts is allowed**.
- **No login,** as the brief asked.

## What I'd do next

- **Pagination** for very large contact lists, done on the API side (for example `?limit=50&offset=100`), alongside search
- **More fields:** phone, company, notes.
