---
name: slide-build
description: Build slides for Session Planner in its slide format – plan the slides of a step, an input, an exercise or a whole deck, write them as HTML fragments in the layout catalogue, check and render them with the real stylesheet and theme, and put them into a workshop step or library entry through the connector or into the slide pool. Use when asked to write, build, make, improve or review slides or a deck ("Folien") for Session Planner, a workshop, a step or the library. For translating a PowerPoint deck use deck-translate.
---

# Build slides for Session Planner

A slide is one `<section class="slide LAYOUT">` in a small HTML subset, written for 1280 × 720. The app's stylesheet gives every slide its look, a theme chosen per workshop gives the colours, fonts and logo, and the server reduces every slide to the format on write. There is no slide editor: slides are text, written here and uploaded. What this folder holds:

| | |
|---|---|
| `reference/catalogue.md` | the rules and all 18 layouts: purpose, markup, options, **what fits**, a complete example each; `reference/look/<layout>.png` shows the example rendered in the default theme |
| `reference/rendering.md` | how the host shows a slide (frame, scaling, what it adds), the type scale, themes and their tokens, pictures as assets, what the sanitiser removes, the generated slides, a standalone preview page |
| `assets/slides.css`, `assets/themes/default.css` | the stylesheet and the built-in theme, copies of `src/slides/` (in the repository `src/` is authoritative; `scripts/slides/refresh-skill.py` refreshes the copies, the catalogue and the renderings, and the tests check that they are current) |

Tools, in the repository under `scripts/slides/`: `check.py` (format, sanitiser, limits, overflow), `build.py` (preview page), `render.sh` (screenshots and contact sheets). The connector's `slide_format` serves the same catalogue to an agent that has no files.

**Private material.** Real workshops, slides and the installation's themes are private: previews and new decks live in a gitignored `private-*/` folder (`private-slide-decks/html/` by convention, the installation's themes under its `themes/`, pictures under `assets/`). This folder and the repository carry the default theme and fictional examples only; the owner adds the installation's themes by hand where a preview needs them (`reference/rendering.md`, Themes).

## 1. Find out where the slides go and what they have to say

- **The target**: a step of a workshop (`workshop_get`: the item's goal, method, duration, materials, notes), a library entry (`library_list`), or a new deck for the pool. In the deck the slides follow the agenda, and the app generates the title, agenda and break slides (`deck_outline`), so those are not written.
- **The material**: the brief, the item's notes, documents the owner gives, and the pool (`pool_search`): a translated slide that fits is copied, not rewritten. The words and the language of the workshop (German unless the material says otherwise).
- **The theme**: the workshop's (`workshop_get`; `settings_get` lists them), so the preview uses the same one (section 3).
- **The outline first**: one line per slide, layout and title. For more than about four slides, or when the material leaves the message open, show the outline and agree it before writing.

## 2. Write

**Where.** One file per slide, `NN-layout.html`, in a deck folder `<root>/decks/<deck>/` next to a `deck.json`; pictures as files under `<root>/assets/`. The root is private (`private-slide-decks/html`). The manifest:

```json
{ "title": "Zeitmanagement", "theme": "default", "chrome": "Zeitmanagement · Beispiel GmbH",
  "entries": [ { "title": "Das Eisenhower-Prinzip", "kind": "block", "category": "input", "duration": 15, "method": "Input",
                 "material": "Moderationskarten", "notes": "…", "slides": ["03-matrix.html", "04-list.html"] } ] }
```

`entries` is optional: the library entries the deck becomes on import (section 4b), each with its slides; `chrome` is the footer line of themes that show one. A slide for an existing step, without new pictures, can go to the connector directly (section 4a); write it to a scratch file first and check it the same way.

**How.** The catalogue (`reference/catalogue.md`) is the whole vocabulary; what it does not offer is not possible. In short:

- **One idea per slide.** Pick the layout by what the slide does (the catalogue's "choosing" rule): a sentence that carries the slide is `statement`, parallel points `cards`, a sequence `steps`, letters with meanings `acronym`, labelled boxes with questions `canvas`, a 2 × 2 `matrix`, a drawn model `model`, an exercise `exercise`, text beside a picture `split`, the rest `list`. One to three slides per input, one or two per exercise.
- **Stay within what fits** (the "Fits" line of each layout). When it does not fit, split the slide or cut words; never shrink type, never add classes or styles of your own.
- **Header**: an optional `div.eyebrow` (where in the day, or the topic), the `h2` title on at most two lines (about 80 characters; no trailing period, no ALL CAPS), an optional `p.lead` of one or two lines. Title, section, statement, quote, break and closing slides have no header.
- **Words a participant reads from the wall**: short, concrete, in the workshop's language; German typographic quotes „…“ (written as characters, not entities); no emoji; one `li` per point, two list levels at most; sources into `footer > span.source` or a `figcaption`.
- **Exercises**: `<h2><span class="tag">Übung</span> Title</h2>`, the task or guiding question as `p.lead`, the steps as `ol.steps`, the facts panel (Dauer, Format, Material) only with values the plan gives.
- **Drawings** are inline SVG on a `viewBox` of about `0 0 1152 470` with the theme classes for colours (`f-accent`, `s-line`, `t`, …), never literal colours. **Pictures** are `<img src="assets/<file>" alt="…">` in a deck folder (raster only: PNG, JPEG, WebP, GIF; the import stores them once by hash), or `asset:<hash>` for a picture the theme's pool (`theme_pool`: pictures for figures, icons with tags for cards as `img.icon`), the slide pool or another slide already shows (`slide_get` lists them). The connector cannot upload pictures.
- **`class="todo"`** marks what the owner must confirm (a fact, a number, a name); the preview and the check list them.

## 3. Check and look

```bash
python3 scripts/slides/check.py <root>/decks/<deck>              # or single .html files; --theme NAME --themes DIR
python3 scripts/slides/build.py <root>                            # <root>/<deck>.html and index.html
OUT=/tmp/shots scripts/slides/render.sh <root>/<deck>.html        # one PNG per slide, contact sheets of six
```

`check.py` reports per slide what the server's sanitiser would remove, classes the stylesheet does not know, how much is on the slide against what the layout holds, missing pictures, todos, and – rendered in headless Chromium with the real stylesheet, theme and fonts – text that leaves the slide or its card, titles that wrap to three lines and pictures that did not load. Fix every error and weigh every warning. Then look at the contact sheets (open the PNGs) for what no check sees: empty halves, a layout that fights the content, a picture cropped wrong. Re-check and re-render what changed until the sheets are clean. The theme comes from `deck.json`; the installation's themes are found in `<root>/themes/` (`NAME.css` with its fonts beside it, or `NAME/theme.css` as on the server), else the check falls back to the default theme and says so.

## 4. Upload

**a) Through the connector**, for slides on a step or a library entry without new pictures (Claude Code with the Session Planner connector, or claude.ai):

- `slide_add` (`html`, or `slides[]`, at a position), `slide_update` (new `html`, exact text `replace[]`, a new position), `slide_set` (the whole list, `keep` for existing ones), `slide_remove`; `item_create` and `item_update` take `slides[]` as well; `library_save` puts a step with its slides into the library.
- Pool slides go in as copies by id: `pool_search`, then `slide_add` with `pool`.
- Read back: `slide_get` shows the slide as stored, so you see what the sanitiser changed; `deck_outline` shows the whole deck with the generated slides, in order.
- The theme per workshop: `workshop_update` with `theme` (`settings_get` lists the names).

**b) Through the slide pool**, for a whole deck and for anything with new pictures (the owner, in the app): Slide pool → Upload deck → choose the root folder. Every `deck.json` found is offered; its slides become a pool deck, its pictures are stored once, and with the box ticked the manifest's `entries` become library entries (existing titles are skipped). From the pool, slides are copied into steps and entries in the app or with `slide_add` and `pool`.

**c) Through the API**, for scripts, where it is reachable with owner rights (the local server, `http://127.0.0.1:5175`, or inside the container with the owner header; the hosted address is private): `POST /api/library/assets` with a multipart field `file` answers `{"hash": …}` for `asset:<hash>`; `POST /api/decks` with `{"title", "theme", "source", "slides": [{"html", "caption"}]}` creates a pool deck; writes carry the header `x-sp: 1`.

## 5. Hand over

Say where the slides are now (workshop and step, library entry, or pool deck, with the slide numbers), what the sanitiser changed if anything, the preview path and the sheets looked at, the todos left for the owner, and the pictures that still have to be uploaded in the app.
