# Slides – format, catalogue and editor (draft 2, 2026-11-01)

Slides for the agenda and the library. A slide is text in a small HTML subset; one stylesheet owned by the app gives every slide its look, and a theme (colours, fonts, logo) is chosen per workshop. Decks are presented from the app, downloaded as one standalone HTML file, or printed to PDF. Slides are edited in the app as content (section 7): fields for the words, a catalogue layout chosen per slide, the appearance from the theme; themes and template slides are edited there too. There is no way back to PowerPoint: existing decks are translated once (section 6).

Stages 1 to 3 (format and catalogue, translation workflow, slides in the app) are done; stage 4 (this draft) adds the editor, themes as data and template slides. How the layouts should look – grid, type scale, compositions, signature devices – is decided in [slide-design.md](slide-design.md).

## 1. Decisions

- **Content, not pictures.** A slide holds structure and text only. Appearance lives in `slides.css`, which is why every deck looks the same, light and dark both work, previews are crisp at any size, text is searchable, and an agent can read and write slides.
- **One design size**, 1280 × 720 px. The host scales a slide to the thumbnail, the item panel, the full screen or the printed page; nothing in the slide knows about its size.
- **A fixed catalogue of layouts** (section 3) instead of free positioning. Every slide picks one layout; what the layout does not offer is not possible. The catalogue was derived from eight real decks and covers what recurs in them.
- **Themes are data.** The repository ships a neutral default theme. The owner's themes are kept as data in the database – ten colours, two fonts, a few choices and the logo – and edited in the app (section 4); the stylesheet is generated from them. Theme folders in the data folder (a hand-written stylesheet with its own fonts) still work, for a partner's brand that needs more than the tokens offer. A theme is chosen per workshop.
- **Content is edited as fields, not as pixels.** The editor (section 7) shows the slide's words in fields next to the live slide, the layout is picked from the catalogue and carries the content along, and nothing can be dragged or resized: what the layout does not offer is not possible, which is what keeps every deck looking the same.
- **Illustrations stay pictures.** Photos and ink-wash illustrations are assets referenced from the slide, stored once by content hash. Simple shapes, matrices and models are inline SVG so they stay sharp and follow the theme.
- **No way back to PowerPoint.** A best-effort PPTX export from this format is plausible later because the format is so constrained, but it is not a goal.

## 2. The slide

```html
<section class="slide cards">
  <header>
    <div class="eyebrow">Tag 1 · Führungskonzepte</div>
    <h2>Was ist Führung?</h2>
    <p class="lead">Ein bewusst schlanker Theorie-Input.</p>
  </header>
  <ul class="cards cols-2">
    <li><h3>Führung ist eine Rolle</h3><p>Keine Persönlichkeitseigenschaft …</p></li>
    <li><h3>Führung wirkt im System</h3><p>Geführt wird ein soziales System …</p></li>
  </ul>
  <footer><span class="source">Quelle: …</span></footer>
</section>
```

- `section.slide` carries the layout as a second class. Inside: an optional `header` (eyebrow, title `h2`, lead), one content block, an optional `footer` with the source. Title, section, statement, quote, break and closing slides have no header; their text sits in a `div.text`.
- The host adds what the slide must not contain: the footer line with deck name and number (themes that show one), the logo, and the scaling.
- **Allowed elements**: `section header footer div span h1 h2 h3 p ul ol li dl dt dd strong em br blockquote cite figure figcaption img table thead tbody tr th td aside code pre` and the SVG subset `svg g path rect circle ellipse line polyline polygon text tspan`.
- **Allowed attributes**: `class`, `alt`, `src` (assets only, see below), `viewBox`, `role`, `aria-label`, the SVG geometry and presentation attributes (`x y width height r rx cx cy d points x1 y1 x2 y2 transform fill fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray text-anchor font-size opacity`).
- **Forbidden**: `style`, `id`, event attributes, `script`, `iframe`, `foreignObject`, `use`, external addresses of any kind. Colours in SVG come from the classes in section 4, never from literal values. The server sanitises on write with this allowlist; the browser sanitises again before rendering.
- **Assets**: `<img src="asset:<hash>">`. The host rewrites the reference to its API, which checks that the requester may see a workshop or library entry that uses the asset. Images are uploaded through the app or the import script; the slide text never carries image data.
- **Design size**: slides are written for 1280 × 720. Font sizes in the stylesheet are in pixels of that canvas; the host scales.

## 3. Layout catalogue

| Layout | Used for | Markup |
|---|---|---|
| `title` | first slide of a workshop or day | `div.text` with `.eyebrow`, `h1`, `p.subtitle`, `p.meta`; optional `figure`, a column at the right edge (a theme may fill the slide with it under a scrim) |
| `section` | a divider between topics | `div.text` with `.eyebrow`, `h1`, optional `.lead`, `ul.list`; optional `figure`, a band across the top; optional `.glyph` |
| `agenda` | the plan of a day, numbered, with optional times or a picture | `ol.agenda > li > span.when? + span`; or `ol.blocks` cards with time ranges; `.cols` when a figure sits next to the list |
| `break` | a pause with its end time | `div.text` with `h1`, `p.until`; optional `figure` |
| `closing` | the last slide | `img.logo`, `h1`, `p` on the theme's field colour |
| `statement` | one sentence that carries the slide, a question for the group | `div.text` with `.eyebrow?`, `p.big`, `p.sub?` |
| `quote` | a quotation with attribution | `blockquote > p + p.sub?`, `cite` |
| `list` | bullet points, one or two levels; rules; literature; points with a heading each | `ul.list` or `ol.list`, modifiers `.compact`, `.two`, `.rows` (a `strong` heading on each point) |
| `cards` | two to five parallel points with heading and text, optional picture, number or short list | `ul.cards.cols-N > li > img.icon? + .eyebrow? + h3 + (p | ul.list)`; modifiers `.numbered`, `.plain` (no surface, picture cropped to a band), `.plain.contain` (illustrations shown whole, labels aligned below), `.picture` (picture fills the top of the card), `.picture.contain` (book covers); cards fill the height they have |
| `split` | text beside a picture or diagram; a definition with an illustration | `div.split > div.text + figure`; the picture a column to the slide's edges, cropped; modifiers `.figure-left`, `.wide-text`, `.contain` (a cut-out or a diagram shown whole; a caption or an svg does the same) |
| `figure` | one large picture with caption | `figure.main > img + figcaption`; modifier `.full` |
| `exercise` | an exercise: the task, its steps, optionally the facts | `header` with `h2 > span.tag + title` and `p.lead` (the question or goal), then `div.exercise > ol.steps + aside.facts? > dl` |
| `steps` | a sequence or process, three to five steps | `ol.flow > li > .eyebrow? + h3 + p` |
| `matrix` | a 2 × 2 with axis labels | `div.matrix > .axis-y + .cells > .cell×4 + .axis-x`; `.cell.accent` |
| `acronym` | letters and their meaning (GROW, VUCA, SCAMPER) | `dl.acronym > div > dt + dd > strong + span`; modifier `.compact` |
| `canvas` | a grid of labelled boxes with guiding questions | `div.canvas.cols-N > .box > h3 + p`; `.box.wide`, `.box.tall`, `.box.accent` |
| `model` | a diagram as inline SVG: pyramid, cycle, curve, triangle | `figure.model > svg + figcaption?` |
| `table` | a small table | `table`, `td.good`, `td.bad`, modifier `.compact` |
| `number` | one large figure with its evidence, or two to four side by side | `ul.numbers > li > p.value + p.label` |
| `compare` | two columns against each other: before and after, option A and B, pro and contra | `div.compare > div.side × 2 > h3 + p? + ul.list?` |
| `timeline` | three to six dated points on one line | `ol.timeline > li > .eyebrow (the date) + h3 + p?` |

Title, agenda, break and closing slides are the ones the app can generate from the workshop (section 5 of the concept); the others are written. The facts panel of an exercise (duration, format, material) can be filled from the item.

Common elements: `.eyebrow` (kicker above the title), `.tag` (the kicker in front of an exercise title, later derived from the item's category), `.lead`, `.takeaway` (the one-line takeaway in the footer of a content slide), `.source`, `.muted`, `.accent`.

The facts panel of an exercise (`aside.facts`: duration, format, material, and the result the group brings back) is optional. It repeats on the wall what the facilitator knows from the plan, so participants see how long they have and what to use; in the app it can be filled from the item instead of being written into the slide.

## 4. Themes

A theme sets the tokens slides.css reads on `[data-theme="name"]` and may add decorations for the title, section and closing slides (a picture scrim, where the logo sits):

- colours: `--bg --surface --surface-2 --line --fg --fg-2 --fg-3 --title --accent --accent-deep --accent-2 --accent-3 --accent-4 --on-accent --field --on-field --on-field-2 --tint` (the accent mixed into the ground: the one panel the format fills) and optionally `--kicker` (small capitals and numerals; the deeper accent unless set)
- type: `--font-display --font-body --font-mono --display-weight` (800 unless set) `--numeral-weight` (300 unless set: the large thin numerals)
- marks: `--mark-size --mark-radius` (the small mark in the accent colour before an unnumbered point: 9 px square unless set; a theme as data chooses square, circle or none)
- shape and chrome: `--radius --chrome` (whether the host's footer line shows), `--logo --logo-light --mark`; the footer line carries the slide number, the deck name and, once the deck has two or more section slides, the section tracker ("Teil 2 von 5") from the first section on

SVG in slides uses classes bound to these tokens: fills `f-accent f-accent-deep f-accent-2 f-accent-3 f-accent-4 f-surface f-surface-2 f-title f-bg`, strokes `s-accent s-line s-fg`, text `t t-small t-display t-on`.

**Themes as data** (`src/domain/theme.ts`, table `themes`, Slides → Themes in the navigation). A theme the owner makes in the app holds:

- ten colours: background, text, title, four accents, text on accent, the field colour of section and closing slides and the text on it. The other tokens (surfaces, line, the two quieter text tones, the deeper accent, the quieter text on the field) are derived from these by mixing in OKLab, so they stay in step when a base colour changes; each can be overridden in the editor's advanced section;
- two fonts, display and body, from a short list the app hosts (Inter, Manrope, Source Serif 4) or the viewer's system stacks, and the heading weight;
- the corner radius, the footer line on or off, whether a picture on the title slide gets a dark gradient with light text, and where the logo shows (closing slide only, title slide, every slide);
- a logo and a light variant for the field colour, uploaded like the printout logo (PNG, JPEG, WebP or SVG, 2 MB), stored in `data/files/theme-logos`;
- the **template family** (`family`): `calm`, the look of the stylesheet, for every theme unless set; or `playful`, the school family of `docs/slide-design-playful.md`, whose decoration (`src/domain/families.ts`) the generated stylesheet lays over the same layouts under the theme's selector: one disc per slide cut by the slide's edge, numerals in filled discs, the wavy line under titles, the facts of an exercise on the dark disc, figures whole on a disc. The accent leads, the second accent answers, the field colour is the dark pole; the family sets the kicker to the accent, the numerals to 800 and the marks to circles. A theme's family changes nothing for other themes.
- a **pool** of pictures and icons (table `theme_assets`, assets of the assets table with a kind and tags): the generated title, agenda and break slides take the pictures in turn, in a fixed order per workshop (seeded by the workshop id, so a deck shows the same pictures every time); icons are offered to cards in the editor. A picture chosen by hand for one of these slides (in the editor, on the generated slide: from the pool, the workshop's pictures or an upload) is kept on the workshop (`pictures`: slide key → asset hash), shown to everyone, copied with a duplicate and spared by the sweep; "automatic" hands the slide back to the pool's turn. The pool is filled on the pictures page (an entry of the navigation: the default theme's pool, switchable between the data themes; files dropped onto the list or picked, several at once, tags typed as one line), in the theme editor, or by `POST /api/themes/<id>/pool` with a file or the hash of a known asset; `GET …/pool` lists it for everyone who sees the theme; a copy of the theme takes the pool along; the sweep leaves pool assets alone, and a workshop's guests may load them through the workshop's route.

The server generates the stylesheet from the tokens (`GET /api/themes/<id>/theme.css`, literal colours, no `color-mix`, so it prints and exports the same everywhere); the browser generates the same stylesheet for the draft while a theme is edited, so every change shows on sample slides at once. The editor checks the colour pairs that carry text against WCAG 2.2 (SC 1.4.3: 4.5:1 for text, 3:1 for large text from 24 px) and marks what falls short. Deleting a theme resets the workshops and the setting that used it to the default. Theme folders in `data/themes/<name>/theme.css` are listed alongside; a data theme with the same id hides a folder.

Fonts are self-hosted by the app: the standalone file inlines the Latin slices of the hosted fonts a theme names, so the deck shows the same type on a machine without them.

## 5. In the app (stage 3)

- **Slides are item content.** `Item.slides` is a list of `{ id, html }` next to the materials, so the library, inserting a copy, duplicating an item or a workshop and the connector carry slides along. Markers and notes have none. A workshop chooses its theme (`workshop.theme`, in its Slides tab), else the settings' default, else the built-in one.
- **Sanitised on write and on render.** The server stores a slide only after `src/domain/slides.ts` reduced it to the format and to exactly one `section.slide` root (anything after the root is dropped); the browser does the same again before it sets the markup, and the frame that shows a slide clips everything in it, `position: fixed` included (`contain: paint`). Pictures are `asset:<hash>` references; the host rewrites them to its API.
- **Assets** are raster pictures (PNG, JPEG, WebP, GIF; the bytes decide, never the file name), stored once by SHA-256 in `data/files/assets`, listed in the `assets` table, served inline and immutable. A workshop's guests load an asset through the workshop's route only while one of its slides shows it; the library route is the owner's. `POST /api/assets/sweep` removes what no slide, library entry or pool deck shows any more and no theme's pool holds.
- **Cut-outs** (`server/cutout.ts`, docs/slide-design.md): a PNG uploaded with a flat background – the border pixels agree on one colour – is freed of it at upload: the colour is flooded from the edges with a tolerance, the edge softened, the result trimmed to its subject and stored as an asset of its own that names its original (`cutout_of`). The upload answers with both hashes, the editor shows the cut-out and lets a picture field switch back to the original (`GET …/assets/<hash>/info` names the pair); photographs and pictures that are transparent already are left alone; the sweep keeps an original and its cut-out together while one of them is used.
- **The slide pool** (`decks`, `deck_slides`): translated decks uploaded once, owner only. The pool page (Slides → Pool in the navigation, `/slides/pool`) takes the preview folder of a translation: every `deck.json` found becomes a deck, its pictures are uploaded once, every slide checked, and on request the library entries the manifest proposes are created (existing titles skipped). Slides are copied from the pool into items and library entries; later changes to the pool leave the copies alone.
- **Item panel and library editor**: a strip of thumbnails; a click opens the slide editor (section 7) on the step or entry. New slides come from a template, as a blank layout, from a picture or from the pool, and open in the editor at once. Agenda cards show the count next to the paperclip, and a click on it opens the editor; library cards show the first thumbnails, which open the editor too.
- **The deck tab** shows the whole deck in agenda order (`src/domain/deck.ts`): a title slide (one per day when there are several), an agenda slide per day with the computed times, the items' slides, and a break slide with its end time for every break without slides of its own; the agenda and break slides can be switched off. From there: present, save as one standalone HTML file, print; the workshop's theme is chosen here, next to "Manage themes". A click on any slide opens the editor on the whole deck.
- **Presenting**: `/w/:id/present`, full screen, arrow keys, space and clicks, `f` for full screen, Escape leaves. **The presenter view** `/w/:id/presenter` is the facilitator's screen while the workshop runs: the current slide large, the next one small, the step's planned time against the clock (minutes left, or over), its facilitation notes. Its Edit buttons open the slide editor on the deck at the slide shown or the next one, and from there any slide; the audience stays on its slide while the editor pages, "Present from here" moves it. **Paging together**: every window of a workshop's presentation – the presentation, presenter views, a phone as remote – pages it and follows it. The server keeps the slide (`POST /api/workshops/:id/present` with the slide's deck key, its number and the window's tag; the live stream passes it on and tells a window that connects where the presentation stands), so a window opened later joins there; `?from=N` ("Present from here") leads from slide N instead. A slide is followed by its key, so slides added before it do not move the audience. Without the server the windows of one browser page together over a broadcast channel. Owner and edit guests lead; view guests are not told. Both views show the workshop live, so a change shows at once. On a phone the presenter view has large buttons at the thumb and pages with a swipe; both views keep the screen on. This is the simple live mode; a re-forecast of the day is still open. **Printing**: `/w/:id/print/slides`, 16:9 pages, one slide each. **The standalone file** carries the stylesheet, the theme with its fonts and logos inlined, the slices of Noto Sans JP its glyphs need, the pictures as data, and a few lines of script; it opens without a server and prints the same pages.
- **Themes**: the owner's themes as data (section 4), edited under Slides → Themes; theme folders `data/themes/<name>/theme.css` with fonts and logos beside them still work, served under `/api/themes`. The repository ships only the built-in default.
- **Template slides** (`slide_templates`, Slides → Templates): named slides to start from, shared by all workshops. A template is made from a layout or saved from the editor ("Save as template"), edited in the same editor, renamed, duplicated, ordered and deleted. Inserting one makes a copy; changing the template leaves the copies alone, like the library.
- **The connector** reads and writes slides as text, on steps and on library entries: `slide_format` hands the agent the rules and the catalogue with an example per layout (`src/domain/slideFormat.ts`), `slide_list`, `slide_get`, `slide_add`, `slide_update` (new markup, text replacements, a new position), `slide_remove` and `slide_set` change them, `pool_search`, `theme_pool` and `deck_outline` show the slide pool, the theme's picture pool and the deck; items take slides when they are created, and the theme is chosen per workshop from the list `settings_get` gives (built in, folders, data themes; docs/mcp.md). Themes and templates are not written through the connector yet.
- **Glyphs**: Noto Sans JP (sliced by unicode range, a dependency) sits behind every font stack of the format, so the kanji of section slides render on any machine; a slice is loaded only when a slide needs it.
- **Writing slides with an agent** is a project skill, `.claude/skills/slide-build/`: it carries the catalogue with an example, a rendering and what fits for every layout, the stylesheet and the default theme as copies, how the host renders, and the workflow from outline to upload. `scripts/slides/check.py` checks fragments against the format, runs the sanitiser, counts what is on the slide against the layout's capacity and renders the slides to find text that overflows; `scripts/slides/refresh-skill.py` renews the skill's copies, and the tests check that they are current. The installation's themes stay private and are added to a preview by hand.

## 6. Translating existing decks (stage 2)

The workflow is a project skill, `.claude/skills/deck-translate/SKILL.md`, with the tools in `scripts/slides/`:

1. **Extract**: `extract.py deck.pptx OUTDIR` reads the PPTX with the standard library only and writes `deck.json` (every slide: layout, background, shapes in z-order with position, fill and text, pictures, tables, charts, SmartArt texts, speaker notes), `outline.md` and `media/` (pictures by content hash).
2. **Cut**: the deck's `deck.json` in the preview folder lists the library entries the deck becomes: title, kind, category, duration, method, material, notes (the tidied speaker notes) and the slides of each. Title, agenda, break and closing slides belong to no entry, since the app generates them; one-off client material is listed as skipped.
3. **Rewrite**: Claude writes one fragment per slide into the catalogue. Only the deck's words; a line a layout needs but the deck lacks is marked `class="todo"` and shows up in the preview. Pictures become assets, simple shapes become SVG, decorative template art is dropped.
4. **Review**: `build.py ROOT` assembles the preview (grid in deck order with the entry headings, click to present, `?only=N` and `?sheet=K` for screenshots), `render.sh ROOT/deck.html` writes a screenshot per slide and contact sheets of six with headless Chromium. Every sheet is looked at before hand-over.
5. **Import**: Slide pool → Upload deck, with the preview folder. The decks found become pool decks; the manifest's entries become library entries on request.

The first deck translated this way, a four-day leadership seminar of 61 slides, became 46 library entries without a todo; the regular structure of its slides (inputs as cards, exercises with the facts panel, questions as statements) maps onto the catalogue one to one. Decks built on older templates will need more judgement per slide, in particular grouped shapes and SmartArt.

## 7. Editing (stage 4)

The editor works on content, the layout arranges it, the theme colours it. Three layers, each edited in its own place, none of them in pixels. What the research into slide tools agreed on went into it:

- **Constrained layouts beat free placement.** Beautiful.ai's Smart Slides are templates that act as constraints: when content is added, the layout adapts, text resizes, spacing adjusts, and a slide that no longer fits is fixed by choosing another template, not by nudging boxes (Beautiful.ai blog, "What the heck are Smart Slides"; third-party reviews 2026). Gamma edits cards whose layout type, column count and blocks can be changed per card while the theme stays the same everywhere (Gamma guides, "How Gamma maps content directly to slides using its card system"). Marp states "separation of content and style" as its design principle: content in Markdown, appearance in a theme stylesheet (marp.app/docs). The catalogue of section 3 is this app's set of constraints; the editor only ever fills it.
- **Three layers, as in PowerPoint and Google Slides.** A theme holds colours and fonts, a master's layouts hold the arrangement and the placeholders, a slide holds content; global formatting belongs on the master or layout, never on the slide, one master per deck, layouts with clear names (think-cell, "How to use and edit slide masters"; pptproductivity, "Difference between templates, themes and layouts"; Google Workspace Updates 2021, Theme builder). Here: theme (section 4), the fixed catalogue with its stylesheet (section 3), template slides as named starting points, the slide.
- **A brand kit keeps a few colours, the fonts and the logo in one place** and applies them to every design (Canva Brand Kit). The theme editor shows ten colours and derives the rest, so a brand is set in minutes and stays consistent.
- **Readable text is a check, not a taste.** WCAG 2.2 SC 1.4.3: 4.5:1 for text, 3:1 for large text (18 pt, or 14 pt bold); the ratio is (L1 + 0.05) / (L2 + 0.05) over the relative luminances. The theme editor computes it for every pair that carries text.
- **On a phone, controls live at the bottom and in one sheet at a time**; nothing hides behind hover (bottom-sheet guidance in design systems and the LogRocket article on bottom sheets). The editor on a phone is one screen: the slide on top, the fields below, previous and next at the thumb.
- **contentEditable is avoided.** Its known problems – cursor jumps, pasted formatting, output that needs cleaning, uneven behaviour on phones and with screen readers (react-sane-contenteditable's issue list; editor vendors' "paste as plain text" modes) – are not worth it when the content is a handful of short texts. The fields are plain inputs; a click on the slide opens the field it shows, and a focused field lights up its element on the slide. Inline emphasis is written as `**bold**`, `*italic*`, `==accent==`, as in the notes. A marker counts only at a word's edge (Markdown's rule for the underscore), so gender stars („Teilnehmer*innen“), `a==b` and `2 * 3` stay text; a marker that would count is written `\*` to keep it literal.

[BELEG?] The reviews of Beautiful.ai and the Gamma guides are vendor or third-party pages read in November 2026; they describe the products, not measured outcomes.

**The slide document** (`src/domain/slideDoc.ts`). A slide's markup is read into a document: its layout, the layout's options (the modifier classes of section 3 as flags and a column count), a header (eyebrow, title, lead, the tag of an exercise), the content part the layout holds – points, cards, steps and facts, a quote, a figure, text blocks, agenda rows, the four cells of a matrix, letters, boxes, a table, the SVG of a model – and the source line. Every field is written back in the catalogue's markup, so the sanitiser leaves it unchanged and the stylesheet knows it. Every slide is checked when it is opened: only when writing the document back shows the same slide (whitespace, attribute order and default classes aside) are its fields offered. Otherwise the body is edited as source with header and footer as fields, and when even those cannot be held (an extra paragraph in the header, emphasis inside a word, `sub`/`sup`), the whole slide is source. Opening a slide and changing one field therefore never changes anything else; a slide kept as source keeps its layout. `LAYOUTS` is the catalogue as a schema: which parts a layout shows, which options it has, how many entries it holds before the slide is over-full.

**Changing the layout** carries the content: the title stays the title, points become cards become steps (headings and texts kept where the new layout has both), a picture stays where the layout shows one, the source stays in the footer. What the new layout cannot hold is said at once – "2 entries do not fit", "the picture has no place" – with the way back next to it.

**Looking first.** Most of the time a slide is opened to look at it, not to change it. So the editor opens as a viewer: the slide as large as the window allows, the thumbnails below it, the header with where it comes from and the position; the arrows, a swipe on a phone or a thumbnail page. "Edit" (or E, or a double-click on a text of the slide, which opens that text's field with the caret at its end) brings the fields; "Done" or Escape goes back to looking, with what was typed stored. Paging keeps the mode. A slide just added (from a template or a layout, "Edit slides" under a step's thumbnails, the pencil of a template) opens straight into editing. Slides that are not edited here – generated, from the pool, a guest's view – stay in the viewer with their note and what can be done instead. Undo and redo work while looking too. From the planner "Present from here" (⋯ menu) opens the presentation at that slide, as long as the slide is in the deck (a parked step's slides are not).

**The editor** (`src/slides/editor`). In editing, on a desktop the slide is large on the left with the thumbnails of the step's slides below, the fields on the right: the layout's options first, then header, content, footer. Entries (points, cards, steps …) are added, moved and removed in place; the count against the layout's room is shown; a picture is chosen from the ones the workshop already shows or uploaded. The slide reports when its content runs over the edge, so the choice is to shorten or to pick a roomier layout. Edits are stored a moment after typing stops, always on the slide they were typed into. The source is still there, behind the ⋯ menu, for what the fields do not reach; what is typed there is applied when the field is left and before the editor pages or closes.

**New slides** start from a template (the owner's), a blank layout (every layout of the catalogue as a thumbnail in the current theme), a picture, or the pool; the first two open the editor at once. In the editor they go after the slide shown, in its step.

**One way to open a slide, everywhere** (`src/slides/editor/source.ts`). A slide thumbnail outside a picker opens that slide in the editor; in a picker (new slide, pool) a thumbnail selects. The editor pages within what it was opened from, and its header says what that is:

| Opened from | Pages through | Can be changed |
|---|---|---|
| a step's details, the slide count on its agenda card | the step's slides | everything |
| the deck tab | the whole deck in agenda order, the steps' names between the thumbnails | the steps' slides; generated slides are shown with where their content comes from |
| a library card or entry | the entry's slides | everything |
| the templates | all templates in their order | everything; inserting makes a template |
| the pool | the deck of the pool | nothing (the pool is a source); "Save as template" |

Generated slides in the deck say what they are made of and what can be done instead: the title slide opens the workshop details; agenda and break slides can be hidden; a break can get a slide of its own (a copy of the generated one, from then on its slide). The editor works on a source of the same shape in every case – the slides with their keys and groups, and writing, inserting, removing and moving – so paging, editing and undo behave the same everywhere.

**History.** The editor keeps its own history (`src/slides/editor/history.ts`): Ctrl+Z (⌘Z), Ctrl+Shift+Z or Ctrl+Y, and buttons in its header. Every change is a step – typing in a field (one step while it goes on; a pause of 1.5 s or leaving the field ends it), a layout or option, a picture, inserting, duplicating, removing and moving a slide. Undo works inside the fields too, so it means the same everywhere in the editor; only the source view keeps the field's own undo until it is applied. A step changed elsewhere since (another window, an agent) is not taken back – it is dropped with a note, rather than overwriting the other change. In the planner the whole session is one undo step: after closing the editor, one Ctrl+Z takes back everything done in it.

**Focus and keys.** The editor, like every dialog, sheet and menu of the app (`src/components/overlay.ts`), takes the focus when it opens, keeps Tab inside, and gives the focus back to what opened it when it closes. Escape leaves a field, then editing, then closes; a menu or picker above it takes Escape first. The arrows page while no field has the focus. The planner's shortcuts wait while anything lies above it.

**The slides area.** What slides are made from – the pool, the templates, the themes – is one entry of the navigation, Slides, with a tab each (`/slides/pool`, `/slides/templates`, `/slides/themes`; the old addresses lead there). Wherever a theme is chosen (a workshop's Slides tab, the settings) "Manage themes" sits next to it; wherever templates are offered (new slide) "Manage templates" does. The area is the owner's: a guest who types its address lands on the workshops shared with them.

## 8. Open points

- Whether the facts panel of an exercise is always generated from the item, or may be written in the slide.
- Charts: inline SVG drawn by the translation for now; a chart element of its own only if it is needed often.
- The partner theme's speech bubble is drawn after the slide master as an SVG background; the fine shape of its curve may still change.
- Accepted (2026-11-02): two people changing different slides of the same step within the same moment: the later save wins (the slides of a step are one field). The presentation's slide lives in the server's memory: after a restart the windows start where their links say.
- Themes and templates through the connector (an agent setting up a client's colours from a style guide); a dark variant derived from a light theme with one click; moving a slide between items.
