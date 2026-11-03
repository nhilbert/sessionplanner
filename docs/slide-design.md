# Slides – design brief (draft 1, 2026-11-03)

What the slide format should look like, decided once for every layout of the catalogue (docs/slides.md, section 3). The stylesheet `src/slides/slides.css` implements it, the themes colour it. This brief is the reference for the design pass of the base stylesheet (stage A below) and for the theme choices that follow (stage B); nothing in it changes the format, the catalogue or the editor.

## 1. Where it comes from

Four reference decks were read for what recurs in them (a red-and-black business deck with curved fields, a navy-and-pink "Vibrant" deck of offset rectangles, a teal-and-orange infographic deck, a cream-and-green editorial deck). They are template stock, so their decoration is not the model; their composition is. What all four share:

- **Colour fields compose the slide.** A solid field – the deep colour or the accent – takes a half, a third or a corner, and the content sits on it or next to it. No slide is text floating on white.
- **The offset frame.** Pictures and panels sit on a second rectangle shifted by a fixed distance, so a plain photo becomes a designed object.
- **Numerals are a design element.** 01, 02, 03, years, percentages and times are set large in the display face and the accent colour, and carry the structure of the slide.
- **A short rule under the title**, in the accent colour, on every content slide.
- **A fixed corner** for the page number or the mark.
- **A rhythm of dark and light**: section slides on the field, content slides on paper, so a deck breathes.
- **Narrow text, much air.** Text takes about half the width; the rest is a field, a picture or empty.
- **Few type sizes, strong contrast**: one display size that is really large, a body size, a small size for the rest.

What is not taken, because each is a template tell: gradients, swooshes and diagonal cuts, drop shadows, hexagons, world maps, photos in circles, icon rows, rounded cards that fill the slide.

## 2. Grid

Design size 1280 × 720. Twelve columns of 74 px, gutters of 24 px, margins of 64 px left and right (12 × 74 + 11 × 24 = 1152). Vertically:

| y | what |
|---|---|
| 56 | top margin; eyebrow sits here |
| 80–136 | title (h2), one or two lines; the rule under it ends at 160 |
| 184 | content starts |
| 640 | content ends |
| 672 | chrome line (deck · section left, page number right) |

A colour field snaps to the grid: 4, 5, 6 or 8 columns wide, and it bleeds to the slide's edge (no margin) when it sits at an edge. Blocks inside the content area snap to columns; nothing is placed at a free position.

The spacing scale is 8, 16, 24, 32, 48, 64. No other distances.

## 3. Type

Five sizes, nothing in between:

| role | size / leading | face | used for |
|---|---|---|---|
| display | 96 / 1.0, tracking −0.02em | display, heavy | h1 on title, section, break; the numeral style |
| title | 44 / 1.15, tracking −0.01em | display, heavy | h2 of content slides; p.big of a statement at 56 / 1.2 |
| subhead | 26 / 1.3 | display, medium | h3 (cards, steps, boxes), lead |
| body | 22 / 1.45 | body | text; lists with four points or fewer are set at 28 |
| small | 15 / 1.3, caps at +0.12em | display | eyebrow, tag, meta, facts labels, source, chrome |

**Numerals** are a style of their own: display face, display or title size, tabular figures, accent colour. Steps, numbered cards, agenda rows, acronym letters, the percentages and times of a facts panel use it. The small badge in a circle disappears.

Titles are short; a title that needs more than two lines of 7 columns needs a lead instead. The display face carries the identity (Raleway or Lato in the owner's themes); the body face is for reading. A theme that uses one face for both still sets the display sizes heavier.

## 4. Colour roles

The theme's tokens keep their names; this brief fixes what each is allowed to do:

- `--bg` is the paper of content slides. `--field` is the one deep colour: section and closing slides, the field blocks of title, agenda, break and exercise slides, the accent cell of a matrix, the frame behind pictures.
- `--accent` has one job: the rule under the title, the numerals, the bullets, the tag. It never fills a large area.
- `--accent-2` to `--accent-4` are series colours for diagrams, the matrix and the model SVG. They do not decorate.
- A slide holds at most one field and one accent. Surfaces (`--surface`) are for the facts panel, the table header and the canvas boxes, and nowhere else by default.
- Contrast stays what the theme editor checks (WCAG 2.2, 4.5:1 for text, 3:1 from 24 px).

## 5. The three compositions

Every layout is one of these; the variant is chosen by the layout's modifiers, not by the theme.

1. **Paper.** Content on `--bg`, the header at the top, the text in 7 to 8 columns, air at the right and bottom. Content does not stretch to fill the slide: cards take the height of their text, lists stay at the top, a short statement sits in the upper half.
2. **Field edge.** A field of 4 or 5 columns stands at the left or right edge over the full height and holds the eyebrow, the title and a numeral, or a picture. The content fills the remaining columns. Title, agenda, break and exercise slides use it.
3. **Full field.** The whole slide on `--field`, text in `--on-field`: section, closing, and the `.on-field` variant of a statement. The deck's generated section slides give every deck the dark-and-light rhythm without anyone choosing it.

## 6. Signature devices

The stylesheet draws them; a theme switches each on or off and picks a style, so a brand is recognisable by its combination (stage B gives the theme editor these choices).

| device | what | theme choice |
|---|---|---|
| title rule | 56 × 3 px bar under the h2 in the accent colour | bar, bar with the diamond (the owner's theme), none |
| offset frame | a rectangle in the field colour, 16 px right and 16 px down behind every picture and the facts panel | on, off |
| corner mark | a 48 × 48 square at the bottom right with the page number in small caps, or the mark | number, mark, none |
| bullet | 8 px square in the accent colour; the second level a 6 px dot in `--fg-3` | square, diamond, dot, dash |
| numerals | the numeral style of section 3 | always on; the theme sets the colour (accent or title) |
| tag | small caps with a short rule before it, in the accent colour | small caps (default), pill |

## 7. Pictures

- A picture always sits in a mask that snaps to the grid: a rectangle of whole columns with the offset frame, or an edge bleed over the full height (5 or 6 columns), or the whole slide (`figure.full`). No rounded corners on pictures; `--radius` applies to cards and panels only.
- The treatment comes from the theme: none, darken blend for ink-wash illustrations on paper (the owner's theme today), or a scrim in the field colour with light text when text lies on the picture (title slide).
- Placeholders are never drawn; a slide without its picture shows the frame alone.
- Illustrations in cards (`.plain.contain`) stay as they are: whole, labels aligned below.

## 8. Chrome

The host's line at y = 672: deck name and section at the left in small caps, the corner mark at the right. On the field compositions the line is light (`--on-field-2`). The logo: title slide bottom left in the field (light variant), closing slide centred, otherwise the mark in the corner if the theme says so. Nothing else sits on every slide.

## 9. The layouts

| layout | composition | what changes against today |
|---|---|---|
| `title` | field edge left (5 columns: eyebrow, h1 display, subtitle, meta); right a picture bleed or paper | no longer text centred on white; the logo in the field |
| `section` | full field; eyebrow, h1 display, lead; the numeral of the section large at the right in `--on-field-2` (the glyph stays an alternative) | the numeral |
| `agenda` | paper; rows with numerals in 7 columns; a field block of 4 columns at the right with the day's title and date, or the picture | rows lose the hairlines, gain the numeral; the block |
| `break` | field edge right with the picture, or paper with the end time as a display numeral | the time as the design element |
| `closing` | full field, centred | unchanged |
| `statement` | paper; p.big left in 9 columns, a short accent rule above; `.on-field` variant | left, not centred |
| `quote` | paper; the quotation mark in the field colour, text in 9 columns, cite in small caps | the colours |
| `list` | paper; 8 columns; 28 px with four points or fewer; `.two` takes 12 | the size with few points; the bullet |
| `cards` | paper; by default no surface: a top rule in the accent colour and a numeral per card, height from the content; `.surface` brings the boxes back | the empty boxes disappear |
| `split` | text 5 columns, picture 6 columns with the offset frame; `.figure-left` mirrored; `.bleed` runs the picture to the edge | the frame; the bleed |
| `figure` | 12 columns with the frame and the caption in small caps; `.full` unchanged | the frame |
| `exercise` | field edge right: the facts panel as a field block of 4 columns over the full height, labels in `--on-field-2`; the steps with numerals in 7 columns; the tag in small caps | the panel becomes the device of every exercise |
| `steps` | numerals 01 02 03 in display size, a hairline joins them, h3 and p below | no arrows, no boxes |
| `matrix` | hairline cells on paper, the accent cell as a field block, axis labels in small caps | the colours |
| `acronym` | the letters as numerals in the accent colour, 2 columns, meaning in 9 | the letters |
| `canvas` | boxes with hairlines, no fills; `.accent` box as a field block | the fills go |
| `model` | unchanged; the SVG classes follow the colour roles | — |
| `table` | hairlines, header row in small caps, `.good` and `.bad` as a small square before the text | the fills go |

## 10. How it is done

- **Stage A, the base stylesheet.** Grid, type scale, compositions and devices go into `slides.css`; the themes keep their tokens. Every layout is rendered in every theme (the owner's two and the default) with the sample content of the skill, as contact sheets (`scripts/slides/render.sh`), and judged against this brief side by side with the version before. Several rounds, on a branch. The skill's copies are renewed with `scripts/slides/refresh-skill.py`; the tests see that they are current.
- **Stage B, the theme choices.** The switches of section 6 and the picture treatment of section 7 become fields of the theme (`src/domain/theme.ts`, the theme editor), and three or four presets are shipped as starting points, every one tuned as a whole.
- **Stage C, the catalogue.** New layouts only for what recurs in the real decks and no composition covers: a large number with its evidence, a timeline, a before-and-after comparison, a picture grid. Variants of existing layouts come first because they cost only a modifier.

## 11. Open

- Whether `--radius` stays a theme choice at all; the paper look wants 0 to 4 px, the partner theme uses 16.
- The size of the display step: 96 fits a two-word title; a German compound of 20 letters needs 80.
- Whether the title rule is drawn by the format (this brief) or stays a theme decoration as today.
- Parked for a later variant, not for this pass: a playful look as an alternative template family – warm earth tones (terracotta, ochre, olive, cream), organic blob shapes and a thin wavy line as decoration, flat illustrated figures beside the text, titles in caps. It is a different family, not a theme of this brief, because its decoration lives in the layouts, not in the tokens.

## 12. The owner's taste (from the design search of 2026-11-03)

Six rows of sample slides on a design canvas, each row a different direction, and the owner's reactions to them, read for what they have in common. This section overrides sections 5 and 6 where they differ; the brief above is kept as the record of the first draft.

- **Editorial and photographic, calm.** Every reference the owner brought is the same genre: light, much whitespace, little text, a large photograph carrying the slide. The brand book says the same (card-free layouts, aerial photography as the one motif). Colour fields as composition (section 5's "field edge") are out.
- **One loud element: the display type.** Manrope 800, large, tight; everything else small and quiet in Lato. No serif display. Numerals large and thin (Manrope 300) in the deep teal, as the counterpart to the heavy titles.
- **Content sits at the bottom edge.** The owner found this original and keeps it as the signature. The header stays at the top; the content block aligns to the bottom of the content area.
- **No containers.** Cards, steps and canvases are columns and rows separated by space, not boxes. A rounded box in a soft tint looked good only in contrast to black-ruled columns; once the lines went, the boxes were not missed. The only surface allowed is a quiet teal tint (the accent mixed into the ground) for the facts panel of an exercise and the accent cell of a matrix, radius 8.
- **An anchor for every item** (added after the first real deck was rendered: equal rows without a mark read as a text wall). Every point, card and step has one entry point for the eye, and only one: the numeral where there is one; else a small mark in the accent colour before an unnumbered point (a 9 px square by default; the theme chooses square, circle or none); else a short accent rule above an unnumbered card, replaced by the card's icon or picture when it has one. Icons are an option per card from the asset pool, never a rule and never before every bullet. The check warns above about 60 words on a content slide: no mark saves a slide that carries the density of an old bullet deck.
- **Lines warm and rare.** Hairlines in a warm grey from the ground, only where they separate rows (list rows, steps, agenda), never black, never as a frame.
- **Warmth from imagery and tint, not from decoration.** Ground a warm off-white, text anthracite, teal as a small accent (the corner mark, kickers, numerals). Pure white with black was too hard; beige without colour was too empty. Gradients, pills, offset frames, blocks or shadows behind pictures, and illustrated decoration all lost.
- **Pictures carry the moment slides.** Title, section, statement and break slides get a large picture as a column, a band or the whole slide, rectangular, borderless, in colour, nothing behind or over it except the scrim a theme asks for. Content slides stay typographic; a picture alternative per content layout is not wanted.
- **A picture never sits as a foreign rectangle on the slide.** Either it bleeds to the slide's edges (a column, a band, the whole slide, cropped to fit) or it is a cut-out with a transparent background that stands on the ground. An illustration with its own flat background in a small box shows hard edges, and a shadow or frame makes them worse: that is the root of the owner's dislike of frames and shadows. Inset pictures with margins on all sides are out of the catalogue.
- **Two kinds of pictures**: aerial landscapes, often abstract, in a cool tonality (water, coasts, fields; the owner's website uses them), and the owner's ink-wash illustrations. Both belong in one pool.

**Picture pool (a feature, stage B).** A theme carries a pool of pictures. The generated title, agenda, break and closing slides, and a section slide made from a template, take a picture from the pool automatically, varied over the deck (rotating, seeded by the workshop, so the same deck shows the same pictures every time), and the editor offers to swap it. The pool is filled through the theme editor and the connector; the sweep leaves pool pictures alone.

**Cut-outs (a feature, stage B).** Illustrations are uploaded with their flat backgrounds (the ink-wash series sits on paper grey or white). At upload the app detects a flat background (the border pixels agree on one colour), floods it from the edges with a tolerance and a soft edge, and stores the cut-out next to the original; the editor shows which one a slide uses and lets the owner switch back when the detection was wrong. A prototype of the routine in pure Python (flood fill, soft edge) cut the sample plant cleanly in one pass. Photographs are never cut out; they bleed.

**Parked:** a playful illustrated family (section 11) stays a separate, later direction.

## 13. The catalogue against the slide-type literature (2026-11-03)

A survey of practice and design sources (Ethos3, consulting-style guides, Abela's chart chooser and Few's critique, Garner and Alley's assertion-evidence studies, Mayer's multimedia principles) was checked against the eighteen layouts of docs/slides.md, section 3.

**Covered.** Structure (title, agenda, section, closing), argument (statement, quote, list in one or two columns, cards as tiles), concept diagrams (matrix, canvas, model for pyramid, cycle, Venn, hub, house), process (steps), comparison (table with good and bad cells, matrix for SWOT and risk), picture (figure, split with the picture on either side, picture cards for a team), workshop (exercise with the facts panel, statement as the reflection question, break). Charts stay out until a deck needs them (section 8 of docs/slides.md).

**Added to stage C**, because the sources name them and the catalogue has no home for them:

- `number`: one large figure with its unit and one line of evidence (the "big number"; also a KPI).
- `compare`: two columns against each other, before and after, option A and B, pro and contra, with a heading and a short list each.
- `timeline`: three to six dated points on one line, with a title and a line each (the "roadmap" of a change process).

**Small additions** to existing layouts: a fourth fact "Ergebnis" (what the group brings back) in the exercise panel, since the sources name task, time, social form and result form as the four parts of an assignment; a takeaway line (`p.takeaway`) as a common element at the foot of a content slide; and a section tracker ("Teil 2 von 5") in the host's chrome, generated from the deck outline, which the app knows.

**One rule changes.** Garner and Alley's studies (engineering students, one working group, so the transfer to workshops is assumed, not shown) favour a headline that states the point as a sentence with the visual as evidence over a topic headline with bullets. Section 3's "titles are short" is softened: a title may be one sentence, two lines at the title size; the lead carries a second sentence; the picture, model or list below is the evidence. Mayer's coherence and signalling principles are what sections 5, 6 and 12 already do: nothing decorative, one accent for emphasis, captions next to their figures.

**Not taken**: chart families, maps, Gantt and swimlanes, team slides with round portraits; the sources' "4 to 6 agenda items" rule, because the app's agenda is a day plan with times, a different thing.
