-- The slide pool (docs/slides.md): decks uploaded once, their slides picked into items and library entries as copies.
CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE deck_slides (
  id TEXT PRIMARY KEY,
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  html TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT ''
);
CREATE INDEX deck_slides_deck ON deck_slides(deck_id);
