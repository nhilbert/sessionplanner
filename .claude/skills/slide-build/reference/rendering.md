# How a slide is rendered

What the stylesheet (`../assets/slides.css`) and the app do with a slide, so that markup can be written for the result. The authoritative code is `src/slides/` (host, export, themes), `src/domain/slides.ts` (sanitiser) and `src/domain/deck.ts` (generated slides).

## The host

- **Design size** 1280 × 720 px. `section.slide` has that fixed size, `overflow: hidden`, padding 52 px top, 64 px left and right, 60 px bottom, and lays its children out as a column with a 22 px gap: an optional `header` (eyebrow, `h2`, lead), **one content block** that takes the remaining height (`flex: 1 1 auto; min-height: 0`), an optional `footer` that sits in the bottom margin (24 px from the edge, 14 px type). So the content block is 1152 px wide and about 608 px high minus the header (about 120 px with eyebrow, one-line title and lead; about 70 px with a title alone).
- **Scaling.** The app puts the slide in a 16:9 frame and scales it with `transform: scale(frame width / 1280)` from the top-left corner (`src/slides/host.css`: `.slide-frame` for thumbnails and previews, `.slide-stage` for presenting and printing). Nothing in the slide knows its size; the same markup is a thumbnail, a card, a full screen and a printed page.
- **The theme** is chosen by `data-theme="NAME"` on an ancestor; the theme's stylesheet defines the tokens under `[data-theme="NAME"]`. The app sets it on the frame; the preview page on `<html>`.
- **What the host adds** (`hostHtml` in `src/slides/SlideView.tsx`): it sanitises the markup again, rewrites `asset:<hash>` to its API (under a theme with a dark ground with `?ground=dark`, which serves a cut-out's dark variant), and appends `<footer class="chrome"><span>deck name</span><span>n</span></footer>` inside the section. That footer shows only when the theme sets `--chrome: flex`, and never on title, section and closing slides. A slide never contains it.
- **Fonts.** The app self-hosts Inter Variable (the default theme's face) and Noto Sans JP 400, sliced by unicode range, which stands behind every font stack so that the kanji of section slides render anywhere; a slice loads only when a slide needs it. Themes bring their own fonts beside their stylesheet.
- **Where slides appear**: the strip in the item panel and the library editor, the agenda and library cards, the deck tab, presenting (`/w/:id/present`, arrows, space, `f`, Escape), the presenter view (`/w/:id/presenter`: current and next slide, time against the clock, notes), printing (`/w/:id/print/slides`, 16:9 pages), and the standalone HTML file (stylesheet, theme, fonts and pictures inlined; opens without a server).

## The type scale

Pixels of the 1280 × 720 canvas; the host scales them. Colours and faces come from the theme's tokens.

| Element | Size / line height | Notes |
|---|---|---|
| body text | 22 / 1.45 | `--font-body` |
| `h1` | 64 / 1.1 | title 64, section 60, break 88, closing 44 |
| `h2` | 42 / 1.15 | the slide title; two lines hold about 80 characters |
| `h3` | 24 / 1.25 | card, step, box and cell headings (cell 30, box 20) |
| `.eyebrow` | 15, uppercase, letter-spaced | accent colour; the tag pill 13 |
| `.lead` | 24 / 1.4 | max-width 1000 px; `fg-2` |
| `ul.list`, `ol.list` | 24 / 1.4, gap 14 | `.compact` 18, nested level 20; `.rows` 20 with a 24 px strong |
| cards `p` | 19 / 1.4 | card padding 24 × 26; `.plain.contain` labels 26 |
| `ol.steps` (exercise) | 24 / 1.4, gap 20 | numbered circles of 40 px |
| `ol.flow` (steps) | heading 24, text 18 | arrows between the columns |
| `.big` (statement) | 48 / 1.25 | `.text.long` 34 / 1.35; max-width 1050 px |
| quote | 38 / 1.3 | max-width 1080 px, 110 px for the quotation mark |
| canvas `p` | 16 / 1.35 | box headings 20 in accent |
| matrix `p` | 19 | axis labels 14 uppercase |
| acronym `dt` | 64 | `.compact` 48; `dd strong` 26, `dd span` 19 |
| table | 20 / 1.35 | `.compact` 17; header row 14 uppercase accent |
| agenda | 24 | `.many` 20; times 18 tabular |
| `.source`, `figcaption` | 14 / 15 | `fg-3` |

Surfaces: cards, cells, boxes, flow steps and the facts panel sit on `--surface`, every second card on `--surface-2`, with `--radius`; `.plain` cards and `.flow.plain` have none. Cards in one row stretch to the full content height; two rows share it. Centred layouts (title, section, statement, break, quote, closing) centre their block vertically and let it keep its natural height.

## Themes

A theme sets tokens on `[data-theme="name"]` and may add decorations (a picture scrim on title slides, a cut-out, where the logo sits). The default theme in `../assets/themes/default.css` shows the complete set:

- colours: `--bg --surface --surface-2 --line --fg --fg-2 --fg-3 --title --accent --accent-deep --accent-2 --accent-3 --accent-4 --on-accent --field --on-field --on-field-2` (field: the full-colour background of section and closing slides)
- type: `--font-display --font-body --font-mono --display-weight`
- shape and chrome: `--radius`, `--chrome` (`flex` shows the host's footer line, `none` hides it), `--logo`, `--logo-light` (used by `.closing .logo`), `--mark`

SVG in slides takes its colours from classes bound to the tokens: fills `f-accent f-accent-deep f-accent-2 f-accent-3 f-accent-4 f-surface f-surface-2 f-title f-bg`, strokes `s-accent s-line s-fg`, text `t t-small t-display t-on`. A slide written this way looks right in a light theme, a dark theme and a partner's brand without a change.

On the server a theme is a folder `data/themes/<name>/theme.css` with its fonts and logos beside it, served under `/api/themes/<name>/…`; `settings_get` and the settings page list the names (lowercase letters, digits and hyphens). A workshop chooses its theme (`workshop.theme`, `workshop_update`), else the settings' default applies, else the built-in `default`.

**The installation's own themes are private.** They are neither in this folder nor in the repository. For a local preview the owner puts `<name>.css` with its fonts into the preview root's `themes/` folder (gitignored); `build.py` and `check.py` find them there (`check.py --themes DIR --theme NAME` also reads `NAME/theme.css`, the server's layout). If this skill is copied out of the repository, the theme stylesheet is added to `assets/themes/` by hand; the repository ignores everything in that folder except `default.css`.

## Pictures

- A picture is `<img src="asset:<sha256>" alt="…">`. Assets are raster files (PNG, JPEG, WebP, GIF – the bytes decide, never the name), at most 10 MB, stored once by content hash under `data/files/assets`, served inline and immutable. A workshop's guests can load an asset only while one of its slides shows it; `POST /api/assets/sweep` removes what nothing shows any more.
- In a deck folder a picture is referenced as `assets/<file>`; the pool import uploads the file once and rewrites the reference to its hash. Through the connector only hashes that already exist can be used (`slide_get` lists a slide's assets); it cannot upload.
- Logos are the theme's: a closing slide carries an empty `<div class="logo"></div>`, which the theme fills. Simple shapes, matrices, pyramids, cycles and curves are inline SVG, never pictures.

## What the sanitiser does

`src/domain/slides.ts` runs on the server when a slide is written and in the browser before it is rendered. It has no DOM: a tokenizer, an allowlist, a stack that closes what was left open.

- **Elements kept**: `section header footer div span h1 h2 h3 p ul ol li dl dt dd strong em br blockquote cite figure figcaption img table thead tbody tr th td aside code pre small sub sup`; inside `svg`: `g path rect circle ellipse line polyline polygon text tspan title desc`.
- **Attributes kept**: `class role aria-label aria-hidden`; on `img`: `src` (only `asset:<hash>`), `alt width height`; in SVG: `viewBox preserveAspectRatio` and the geometry and presentation attributes (`x y width height r rx ry cx cy d points x1 y1 x2 y2 dx dy transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset text-anchor dominant-baseline font-size font-weight font-family letter-spacing opacity clip-rule`).
- **Dropped with everything inside**: `script style iframe object embed foreignObject use link meta base form input button textarea select option video audio source math template noscript canvas head`, SVG `animate set animateTransform animateMotion image feImage`, and HTML comments.
- **Unwrapped** (the element goes, its text stays): every other element, e.g. `a`, `b`, `i`, `u`, `h4`, `mark`, `hr`, `nav`.
- **Values refused**: anything with `<`, `>`, `url(`, `javascript`, `expression` or `&#`; `class` other than letters, digits, `_`, `-` and spaces; `fill`/`stroke` other than `none`, `currentColor`, `transparent`, `#hex` or `var(--…)` (and the format wants the classes, not these); `src` other than `asset:<16–64 hex>`.
- **Normalised**: self-closing SVG elements are written out (`<rect …></rect>`), open elements are closed at the end, attribute values get double quotes, and a fragment whose root is not `section.slide` is wrapped into `<section class="slide list">…</section>`.

In practice: no `style`, no `id`, no links, no entities (`&nbsp;`, `&#8222;` – write the characters themselves: „ “ – · ×), no comments survive. `scripts/slides/check.py` runs this sanitiser and reports what it would remove; through the connector `slide_get` shows the slide as stored.

## The generated slides

`src/domain/deck.ts` assembles the deck of a workshop in agenda order: a **title slide** per day (eyebrow: day number and date when there are several days, else the date; `h1` the workshop title; `p.subtitle` the client; `p.meta` the location), an **agenda slide** per day with the computed start times (eleven lines each, `.many` beyond eight, group headings as lines, breaks muted; a longer day gets a second agenda slide), the items' own slides, and a **break slide** for every break without slides of its own (`h1` the title, `p.until` the minutes and `bis HH:MM`). Agenda and break slides can be switched off per deck. No closing slide is generated: write one when the deck should end on the logo. Markers and notes have no slides.

## A standalone preview page

When the repository is not at hand (the skill used from claude.ai, say), a page like this shows slides with the format. Paste the two stylesheets from `../assets/` into the `style` elements; each slide goes into a frame that scales it to half size.

```html
<!doctype html>
<html lang="de" data-theme="default">
<head>
<meta charset="utf-8">
<title>Slide preview</title>
<style>/* assets/slides.css */</style>
<style>/* assets/themes/default.css */</style>
<style>
  body { margin: 0; padding: 24px; background: #2a2d31; display: grid; gap: 24px; grid-template-columns: repeat(auto-fill, 640px); }
  .frame { width: 640px; height: 360px; overflow: hidden; position: relative; }
  .frame .slide { position: absolute; left: 0; top: 0; transform: scale(0.5); transform-origin: 0 0; }
</style>
</head>
<body>
<div class="frame"><section class="slide statement"><div class="text"><div class="eyebrow">Leitfrage</div><p class="big">Was braucht dieses Team, um gut zu entscheiden?</p></div></section></div>
</body>
</html>
```

`asset:` references do not resolve outside the app; leave the pictures out of such a preview or point `src` at a local file for the look. The fonts fall back to the system's unless Inter is available; the type runs a little wider then.
