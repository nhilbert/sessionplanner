-- The variant chosen by hand for a generated title slide of a workshop (docs/slides.md): slide key (title:<day>) →
-- variant, as JSON; a title slide without an entry takes the variant of its theme.
ALTER TABLE workshops ADD COLUMN variants TEXT NOT NULL DEFAULT '{}';
