-- Worksheets of a step (docs/worksheets.md, stage 2): a list of sheets, each with its pages in the worksheet format.
ALTER TABLE items ADD COLUMN worksheets TEXT NOT NULL DEFAULT '[]';
