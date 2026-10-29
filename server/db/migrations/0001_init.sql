-- Session Planner schema (docs/concept.md, section 2). Times are minutes after midnight in the workshop's time zone.
CREATE TABLE workshops (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  client TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL DEFAULT 'Europe/Berlin',
  packing TEXT NOT NULL DEFAULT '{}',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE days (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  position REAL NOT NULL,
  date TEXT NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER
);
CREATE INDEX days_workshop ON days(workshop_id);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  day_id TEXT,
  position REAL NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  duration INTEGER NOT NULL DEFAULT 0,
  fixed_start INTEGER,
  goal TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT '',
  lead TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  materials TEXT NOT NULL DEFAULT '[]',
  attachment_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX items_workshop ON items(workshop_id);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX attachments_workshop ON attachments(workshop_id);
