# Slide design: the playful family (school workshops)

The second template family beside the calm editorial-photographic one of `docs/slide-design.md`. It is for workshops with teachers, school leaders and pedagogical teams: warmer, rounder, more colour, and still professional. Found in a design search on 2026-11-03 (four rounds, eleven rows of six sample slides on a private design canvas, the owner's reactions read for the taste behind them, in the way section 12 of the first brief was found). Nothing here is implemented yet: this document is the brief for the stylesheet and the theme work that follows.

## 1. What fell, and why

| round | rows | what the owner said | what it meant |
|---|---|---|---|
| 1 | A earth tones and blobs, B circles on a dark ground, C large colour fields, D workshop | B and A best; A full of placement errors of the illustrations; the logo must work, so B is out; C good but not playful enough, try waves | B's disc and contrast are the core, not its dark ground; A's errors were execution, not idea; the family needs more than fields |
| 2 | E disc on a light ground, F waves, G discs and waves | B still better than E; the waves do not please; teal should be more present | E lost the contrast that B had; one form only, the circle; the brand colour leads |
| 3 | H teal with violet as the dark disc, I teal only with a deep teal as the dark pole | I best; the ink illustration on the coral disc hurts, coral against the deep teal is difficult; violet is out; too little yellow; the ink drawings distract most, they are from one workshop and not "the" illustrations | yellow is the second lead colour, not a dab; coral never meets the deep teal; the illustrations are the real lever and must be flat vectors in the slide's own colours |
| 4 | J flat figures from unDraw recoloured, K flat objects drawn by the model | J is good; K shows the model cannot draw meaningful objects, the plant does not work, not to be pursued | J is the family; illustrations come from a drawn source, never from the model |

Photographs were taken off the table in round 1 ("rather an extended palette and illustrations, rounder, more circles, maybe wavy lines, large colour fields, contrasts").

## 2. The owner's taste

In one sentence: flat forms in teal and yellow on cream, one disc per slide, people and things as flat vectors in the same colours, the deep teal as depth, coral only as a skin tone.

- **One form, the disc.** Every slide that is not pure text carries one large disc, cut by the slide's edge: from the left on a section slide, from the right on split and exercise slides, from the bottom right on a statement slide. The title slide stacks two: the deep-teal disc from the bottom right, the sun disc wholly on it, a small teal dot on the deep teal. Blobs, waves and hand-drawn circles are out; the disc is the whole vocabulary of shape.
- **Contrast on a light ground.** Cream ground, saturated fields, hard edges between them. What the owner liked in the dark round-1 row was the contrast, not the darkness: a pale version of the same row lost it. The darkness stays in the deck as the deep-teal disc and the deep-teal statement ground, never as the ground of the title slide, because the colour logo must stand on cream.
- **Teal leads, yellow answers.** The brand teal is the lead colour (the section disc, the figures' clothes, kickers, the wavy line); the sun yellow is the second lead (the title disc, the split disc, the highlighted word of a statement, the tag). The deep teal, derived from the brand colour, is the dark pole; it replaced the violet, which "does not work at all". Coral survives only as the skin tone of the figures and must never lie on the deep teal.
- **The picture is part of the colour system, not a guest.** The three references the owner brought (a flat-figure slide pack, a flat figure on a yellow ground, flat icons on yellow) share one thing: flat vector shapes without ink lines, in the colours of the slide itself. The owner's ink-wash series, which carries the calm family, is foreign here in hue (grey-green on paper) and in hand (brush, wash), and was the one thing that "hurt" in every round; it stays with the calm family. Objects drawn by the model (books, a sprout, a fence with speech bubbles, icons) failed: illustrations come from a drawn source.
- **A figure stands wholly on a field or wholly on the ground, never on an edge.** The round-1 row A lost on exactly this: figures cut by a blob edge, a plant on a field edge, the footer line over a field. The chrome changes colour where it lies on a field.
- **The type of the first family.** Manrope 800 for titles and numerals, Lato for text; no serif display. The one hand gesture allowed is the short wavy line under a title (in teal or sun). The section numeral is huge and cream on the teal disc; card and step numerals sit in filled discs; the tag is a pill in sun.
- **Playful is not childish.** No doodles, no confetti, no cartoon faces; the play comes from form and colour.

## 3. Colour roles

| role | value | use |
|---|---|---|
| ground | cream `#FBF3E4` | every content slide and the title slide |
| text | ink `#262233`, quieter `#5C5870` | text on cream, on the brand teal and on the sun |
| lead | brand teal `#22C1AA` | the section disc, the split disc's partner, kickers, the wavy line, the first disc numeral, the figures' clothes |
| second lead | sun `#F0B340` (lighter `#F7D27C` in illustrations) | the title disc, the split disc, the highlighted word on the deep teal, the tag, the second disc numeral |
| dark pole | deep teal `#0F6B60` | the large title disc, the statement ground, the facts disc of an exercise, the third disc numeral, the figures' trousers and hair |
| skin | `#F4A58A`, shadow `#C9553B`; coral `#E8694A` as a small accent | the figures only |

Rules: small text on the brand teal is ink, never cream (cream on `#22C1AA` is about 2.3:1); only the 300 px section numeral is cream there. On the deep teal, text is cream and the highlighted word is sun. Coral never lies on the deep teal. Violet is gone. Plants and leaves in the brand teal stand on cream or sun, never on teal, where they vanish.

## 4. Illustrations

- **Source:** unDraw (Katerina Limpitsouni, MIT licence; 1,740 motifs; the npm package `undraw-svg` bundles them with the primary colour as `currentColor`). Motifs chosen for the samples: `sharing-knowledge` (title), `plants` (statement), `public-discussion` (split); candidates for later: `teaching`, `working-together`, `questions`, `conversation`, `team-spirit`, `educator`, `high-five`, `blooming`. The owner's open question on the row: "the right people, or too much office?" A pool of school motifs is to be built up over time; the catalogue says nothing about where the figures must come from, only how they must look.
- **Recolouring** maps unDraw's palette to the family's tokens: `currentColor` → brand teal; the dark greys `#090814 #2f2e41 #2f2e43 #3f3d56 #010102` → deep teal; the skin tones `#ffb6b6 #ffb8b8 #ffb9b9 #f8a8ab` → `#F4A58A`, `#ed9da0` → coral, `#9e616a #a0616a` → `#C9553B`; the light greys `#f2f2f2 #e6e6e6` → sun, `#d6d6e3 #ccc #cacaca` → lighter sun; white → cream. The mapping is a straight string replacement on `fill` and `stroke` values; every motif tried came out fully mapped.
- **Placement:** an SVG with a transparent background, shown whole, wholly on a bright field (sun, teal or cream) or on the ground. Sizes on the samples: 400 px wide on the title disc (radius 360), 500 px wide on the split disc (radius 480), 360 px wide on the statement disc (radius 300). No cut-out routine is needed: the SVGs carry no background.
- **Not in this family:** photographs, the ink-wash series, objects drawn by the model, icons before bullets.

## 5. The six sample slides (row J)

| slide | composition |
|---|---|
| title | cream; eyebrow in teal, h1 Manrope 800 at 72 px in 5 columns, the wavy line in teal, subtitle; the deep-teal disc (centre 1040/620, r 560) from the right and bottom edges, the sun disc (1060/580, r 360) wholly on it with the figures, a teal dot (1180/170, r 50); the colour logo at the bottom left on cream |
| section | cream; the teal disc (200/360, r 500) from the left with the numeral `02` at 300 px in cream; at the right the h1 at 64 px, the wavy line in sun, the lead; the footer line in ink where it lies on the disc |
| statement | deep teal; the eyebrow, `p.big` at 64 px in cream with the key word in sun, the sub line in cream; the cream disc (1100/600, r 300) at the bottom right with the plants |
| cards | cream; three columns, a 120 px disc per card (teal, sun, deep teal) with the numeral in ink or cream, h3, text; no rules, no surfaces |
| split | cream; text in 5 columns with the wavy line and three bullet dots (teal, sun, deep teal); the sun disc (1060/380, r 480) from the right with the two figures; the page number in ink on the sun |
| exercise | cream; the tag as a pill in sun, the title, the lead; the steps with 48 px disc numerals (teal, sun, deep teal, teal); the deep-teal disc (1120/380, r 400) from the right holds the facts, labels in sun, values in cream; the page number in cream on the disc |

## 5a. How it is built (2026-11-03)

The family is the `family` token of a theme as data (`docs/slides.md`, section 4): `playful` makes the generated stylesheet append the rules of `src/domain/families.ts` under the theme's selector, so the decoration below rides on the same layouts and markup. Everything else of the family is ordinary theme data: the colours (section 3; the accent is the brand teal, the second accent the sun, the field colour the deep teal, text on the accent is ink), Manrope and Lato, display weight 800, circle marks, the footer line on, the logo on the title slide, and the pool with the recoloured figures as transparent PNGs (the app accepts raster pictures only, so the SVGs are rasterised at 1600 px before the upload). Every theme without the token is calm; no existing deck changes.

## 6. What the family needs differently from the catalogue

The layouts of `docs/slides.md` section 3 stay (the markup of a slide does not change); the look needs a stylesheet of its own or a family switch in `slides.css`, because, as section 11 of the first brief said, its decoration lives in the layouts, not in the tokens.

| item | the calm family (first brief) | the playful family |
|---|---|---|
| field shape | rectangles: a field edge, a band, a full field | a disc, cut by the slide's edge; one per slide, two stacked on the title |
| title | field edge or picture column with the scrim; the logo in the field | cream ground, the two discs with the figure on the sun disc, the colour logo on cream; no scrim, no picture column |
| section | full field with the numeral at the right | cream with the teal disc at the left carrying the numeral; the title on the ground |
| statement | paper, `p.big` with a short accent rule; `.on-field` as a variant | the deep-teal ground is the default, the key word in sun, a cream disc with a figure; the rule goes |
| cards | a top rule and a thin numeral per card | a filled disc per card with the numeral in 800, colours cycling teal, sun, deep teal |
| split | the picture as a column to the slide's edges, cropped | a disc from the right with the figure whole on it; text in 5 columns |
| exercise | the facts panel as a tinted block over the full height | the facts on the deep-teal disc; the tag as a pill |
| steps and lists | thin numerals, a hairline between rows, the small square mark | numerals in filled discs; no hairlines; round marks in the three colours in turn |
| numerals | large and thin (300) in the kicker colour | 800 in cream on the section disc; 800 in discs elsewhere |
| title rule | a 56 × 3 px bar (or the diamond) | the short wavy line, 160 to 200 px, in teal or sun |
| chrome | one colour | recoloured where the footer or the page number lies on a disc |
| pictures | photographs bleeding, ink cut-outs on the ground | flat SVG figures recoloured to the tokens, whole, on a disc or on the ground |
| colour tokens | ground, text, title, four accents, field | the same tokens, plus a second lead colour that carries fields (sun), a dark pole (deep teal) and a skin tone for the recolouring; the brand teal as `--accent` and `--field` |

Features this family asks for, beyond the stylesheet:

- **Recolouring at upload.** An SVG in a theme's pool is recoloured by the mapping of section 4 when the theme is bound to the family; the mapping belongs to the theme (its lead, dark and skin tokens), the source palette to the family. The pool then holds motifs once and every theme shows them in its own colours.
- **Disc positions as data.** The disc's centre and radius per layout are the family's constants (section 5); the editor needs no control for them. A theme switches the family on; it does not move discs.
- **Contrast check with the family's pairs.** The theme editor's WCAG check must know that small text on the lead colour is ink and that cream is allowed only on the 300 px numeral.

## 7. Open

- Whether people or no figure at all on a given slide: a content slide without a motif is fine; a wrong motif is worse than none.
- The motif supply for school themes (classrooms, conferences, parents) beyond the office scenes unDraw has most of; the owner has no stock of his own.
- The agenda, break and closing slides were not in the sample rows; by the rules above: agenda on cream with disc numerals, break with the end time as the numeral on a teal disc, closing on the deep teal with the light logo.
- Whether the family also serves decks for non-school clients who want warmth; the brand logic (teal, Manrope and Lato) is kept, so it could.
