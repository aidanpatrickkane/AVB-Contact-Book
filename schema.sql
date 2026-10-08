-- One row per person.
CREATE TABLE IF NOT EXISTS contacts (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, -- generated always as identity makes postgres auto-increment and assign id and not allow manual id setting
    first_name  TEXT NOT NULL CHECK (length(trim(first_name)) BETWEEN 1 AND 100), -- not null makes names required
    last_name   TEXT NOT NULL CHECK (length(trim(last_name)) BETWEEN 1 AND 100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(), -- timestamptz stores utc moment so and postgres converts it to reader's time zone when it's read back
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A contact can have many emails (one-to-many), so emails get their own table.
-- The foreign key lives on the "many" side: each email points to its contact.
CREATE TABLE IF NOT EXISTS emails (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contact_id  BIGINT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE, -- REFERENCES contacts (id) is the foreign key. You can't add an email for a contact that doesn't exist.
    address     TEXT NOT NULL CHECK (length(address) BETWEEN 3 AND 254),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A contact can't have the same email twice, ignoring case
-- (john@x.com and John@X.com count as the same).
-- contact_id is the first column, so this index also makes
-- "get all emails for contact X" fast.
CREATE UNIQUE INDEX IF NOT EXISTS emails_contact_address_key
    ON emails (contact_id, lower(address));

-- this ensures the same contact can't have multiple of the same address, case insensitive. it also makes email lookups fast for a contact because explicit indexing groups by contact id then address, so the scanner goes straight to the desired contact id and scans those addresses instead of scanning the entire table for addresses