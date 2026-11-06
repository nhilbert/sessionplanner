-- Deleted workshops wait 30 days in the trash before they go for good (docs/concept.md, section 10): the time they were
-- deleted, null for a workshop in use. Everything of a deleted workshop stays as it was, its files on disk too.
ALTER TABLE workshops ADD COLUMN deleted_at TEXT;
CREATE INDEX workshops_deleted ON workshops(deleted_at);
