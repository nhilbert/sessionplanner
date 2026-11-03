-- Pictures chosen by hand for the generated slides of a workshop (docs/slides.md): slide key → asset hash, as JSON;
-- a slide without an entry takes its picture from the theme's pool in turn.
ALTER TABLE workshops ADD COLUMN pictures TEXT NOT NULL DEFAULT '{}';
