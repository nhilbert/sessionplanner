-- A data theme's own rules and files (docs/slides.md, section 4): CSS laid over the generated stylesheet, and the
-- fonts and pictures it addresses, as JSON [{path, mime, size, updatedAt}]; the files live in data/files/theme-files/<id>.
ALTER TABLE themes ADD COLUMN css TEXT NOT NULL DEFAULT '';
ALTER TABLE themes ADD COLUMN files TEXT NOT NULL DEFAULT '[]';
