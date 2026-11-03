-- The asset pool of a theme (docs/slides.md, section 4): pictures the generated slides take in turn and icons a card
-- may carry, each an asset of the assets table, with tags for finding them. A cut-out made at upload (an
-- illustration freed of its flat background) is an asset of its own that names its original.
CREATE TABLE theme_assets (
  theme_id TEXT NOT NULL,
  hash TEXT NOT NULL,
  kind TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (theme_id, hash)
);
ALTER TABLE assets ADD COLUMN cutout_of TEXT;
