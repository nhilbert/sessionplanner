-- Slides on items (docs/slides.md): markup in the slide format, as a JSON list of { id, html }; the pictures they show
-- live once per content hash in data/files/assets and are listed here. A workshop may choose its slide theme.
ALTER TABLE items ADD COLUMN slides TEXT NOT NULL DEFAULT '[]';
ALTER TABLE workshops ADD COLUMN theme TEXT NOT NULL DEFAULT '';

CREATE TABLE assets (
  hash TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
