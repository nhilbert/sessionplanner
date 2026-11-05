-- Files of library entries (docs/concept.md, section 5). Which item of an entry holds a file is kept in the entry's
-- data (attachmentIds per item, like a step's in a workshop); inserting an entry copies its files into the workshop.
CREATE TABLE library_attachments (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES library(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX library_attachments_entry ON library_attachments(entry_id);
