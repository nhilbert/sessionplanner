-- Library entries carry tags (free words to filter the library by, kept as a JSON list) and wait in the trash like
-- workshops (docs/concept.md, section 10): the time an entry was deleted, null for one in use. An entry in the trash
-- keeps its content and its files until the trash lets go of it.
ALTER TABLE library ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE library ADD COLUMN deleted_at TEXT;
CREATE INDEX library_deleted ON library(deleted_at);
