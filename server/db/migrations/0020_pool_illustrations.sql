-- A third kind in a theme's pool (docs/slides.md, section 4): illustrations beside photos (kind 'picture') and icons.
-- A place that crops its picture takes a photo, one that shows it whole an illustration. Until now both were filed as
-- pictures. A theme of the playful family shows every figure whole and takes no photographs
-- (docs/slide-design-playful.md), so what its pool holds as pictures are illustrations; the pools of the other themes
-- are sorted by hand on the pictures page, where an entry's menu moves it.
UPDATE theme_assets SET kind = 'illustration'
WHERE kind = 'picture' AND theme_id IN (SELECT id FROM themes WHERE json_extract(tokens, '$.family') = 'playful');
