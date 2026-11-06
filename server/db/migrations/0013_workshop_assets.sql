-- The pictures a workshop has held: what its guests may place on its slides, also after they were taken out, so that
-- undo works. Pictures on its slides now need no row here: they count as long as they are shown.
CREATE TABLE workshop_assets (
  workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  hash TEXT NOT NULL,
  PRIMARY KEY (workshop_id, hash)
) WITHOUT ROWID;
