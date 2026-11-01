-- Slide themes as data (docs/slides.md, section 4): a few colours, two fonts and some choices, kept as JSON; the
-- stylesheet is generated from them. Logos uploaded for a theme live in data/files/theme-logos. Template slides
-- (section 7): named slides to start new slides from, shared by all workshops.
CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  tokens TEXT NOT NULL DEFAULT '{}',
  logo TEXT,
  logo_light TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE slide_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  layout TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
