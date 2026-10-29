-- Guests with access to a workshop (docs/concept.md, section 8): people the owner invited as guests in Entra and
-- lets in at the login. They see only the workshops listed here for their e-mail.
CREATE TABLE members (
  workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  show_notes INTEGER NOT NULL DEFAULT 0,
  added_at TEXT NOT NULL,
  last_seen_at TEXT,
  PRIMARY KEY (workshop_id, email)
);
CREATE INDEX members_email ON members(email);
