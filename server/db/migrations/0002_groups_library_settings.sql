-- Colour categories, groups, workshop-wide material, settings and the library (docs/concept.md, stage 2).
ALTER TABLE items ADD COLUMN category_id TEXT;
ALTER TABLE items ADD COLUMN color TEXT;
ALTER TABLE items ADD COLUMN group_id TEXT;
ALTER TABLE workshops ADD COLUMN materials TEXT NOT NULL DEFAULT '[]';

-- A heading over consecutive items. Groups and ungrouped items share the positions of a day (or the parking
-- lot); the members of a group are ordered by their own positions within it.
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  day_id TEXT,
  position REAL NOT NULL,
  title TEXT NOT NULL DEFAULT ''
);
CREATE INDEX groups_workshop ON groups(workshop_id);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Reusable items and groups, shared by all workshops; inserting one makes a copy.
CREATE TABLE library (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
