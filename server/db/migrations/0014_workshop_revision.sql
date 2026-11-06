-- Rises with every change of a workshop: what a snapshot and an event of the live stream say about their order, so that
-- a window can tell what it has already and leave a late snapshot out. Kept here, so a restart does not start it afresh.
ALTER TABLE workshops ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
