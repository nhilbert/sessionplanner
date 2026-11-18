-- Print rules (docs/worksheets.md, stage 0): how many take part in a workshop, how many groups work on a step, and per
-- file of a step how many copies to print and how. Files without a rule print nothing.
ALTER TABLE workshops ADD COLUMN participants INTEGER;
ALTER TABLE items ADD COLUMN groups INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN print_rules TEXT NOT NULL DEFAULT '{}';
