-- A guest reads the library, and inserts from it into this workshop when they may edit it, only where the owner
-- switched that on for them (docs/concept.md, section 8): off unless set.
ALTER TABLE members ADD COLUMN library INTEGER NOT NULL DEFAULT 0;
