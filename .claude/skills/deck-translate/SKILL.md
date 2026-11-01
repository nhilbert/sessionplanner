---
name: deck-translate
description: Translate a PowerPoint deck into Session Planner slides (docs/slides.md): extract the deck, rewrite every slide into the layout catalogue as HTML fragments, propose the cut into library entries, build the preview and check the screenshots. Use when asked to translate, convert or import a deck, a .pptx or "Folien" into the slide format or the library.
---

# Translate a deck into the slide format

The format and the catalogue are in `docs/slides.md`; the stylesheet is `src/slides/slides.css`. Read both first. Decks and everything made from them are private: they live in a gitignored `private-*/` folder (by default `private-slide-decks/`, preview root `private-slide-decks/html/`), never in the repository.

## 1. Extract

```bash
python3 -I scripts/slides/extract.py "private-slide-decks/<deck>.pptx" private-slide-decks/html/extract/<deck>
```

Writes `deck.json` (every slide with its shapes, positions, fills, text, pictures, tables, charts, SmartArt texts, notes), `outline.md` (one line per slide) and `media/` (pictures by content hash). Read `outline.md` whole, then `deck.json` slide by slide while writing.

## 2. Decide the cut

Before writing slides, list the library entries the deck should become, in `decks/<deck>/deck.json`:

```json
{
  "title": "…", "theme": "sr-light", "chrome": "…",
  "entries": [
    {"title": "Stress entsteht, wenn Soll ungleich Ist", "kind": "block", "category": "input", "duration": 15,
     "method": "Input", "material": "", "notes": "…", "slides": ["05-statement.html", "06-cards.html"]}
  ]
}
```

- One entry per input (one to three slides) or exercise (one or two slides); a section divider belongs to the first entry of its topic; the title, agenda, break and closing slides belong to no entry (the app generates them) but are still translated so the deck can be shown whole.
- `kind` is the agenda item kind (`block`, `break`), `category` one of the app's categories (input, exercise, discussion, reflection, energizer, organisation), `duration` in minutes when the deck or the notes say so, else omitted.
- Speaker notes become `notes` of the entry (facilitation notes), tidied, not invented.
- Client-specific one-offs (survey results, participant lists, dates) are not translated: list them under `"skipped"` with the slide numbers and a reason.

## 3. Write the slides

One file per slide, `NN-layout.html`, a single `<section class="slide LAYOUT">` as the catalogue shows. Rules:

- **Only the deck's words.** Nothing is added that the slide or its notes do not say. Where a layout needs a line the deck does not have (a card text, a guiding question), either leave it out or write it and mark the element with `class="todo"`, so the review finds it. The preview flags slides with todos.
- **Pick the layout by what the slide does**, not by how it looked: a sentence that carries the slide is `statement`, parallel points are `cards`, a sequence is `steps`, letters with meanings are `acronym`, labelled boxes with questions are `canvas`, a 2 × 2 is `matrix`, a shape diagram is `model` as SVG, everything else that is text is `list` or `split`.
- **Exercises** get the `exercise` layout: the tag in the title, the task or goal as `.lead`, the steps as `ol.steps`, and the facts panel (`aside.facts`: Dauer, Sozialform, Material) only with values the deck gives.
- **Pictures** become assets: copy the file from `extract/<deck>/media/` to `assets/` under a short name and reference it as `assets/<name>`; photos and illustrations stay, decorative template art and icons that only decorate are dropped. Simple shapes, matrices, pyramids, cycles and triangles are redrawn as inline SVG with the theme classes, never kept as pictures.
- **Text**: German typographic quotes „…“, no emoji, no trailing periods on titles, no ALL CAPS (the eyebrow styles itself), lists keep their order, one `li` per point, two levels at most.
- **Charts**: a small SVG when the data is in `deck.json`, else the picture, with a `figcaption` naming the source.
- **Sources** go into `footer > .source` or the `figcaption`, never into the body.
- **Logos are the theme's.** A closing slide carries `<div class="logo"></div>`, which the theme fills; a logo is never uploaded as an asset, and assets are raster pictures only (PNG, JPEG, WebP, GIF), never SVG.

## 4. Build, render, check

```bash
python3 scripts/slides/build.py private-slide-decks/html
OUT=/tmp/shots scripts/slides/render.sh private-slide-decks/html/<deck>.html
```

Look at every contact sheet (`<deck>-sheetK.png`). Fix text that overflows, titles that wrap into three lines, empty halves, todos that can be resolved from the notes. Re-render only what changed. Then hand over: the preview path, the number of slides and entries, the skipped slides, and the todos left for the owner.

## 5. Import

In the app: Slide pool (in the navigation) → Upload deck, choosing the preview folder (`private-slide-decks/html`). Every `deck.json` found is offered; the slides become a deck in the pool, the pictures are stored once, and the manifest's entries become library entries when the box is ticked (existing titles are skipped). Hand over with the preview path and the numbers; the owner uploads.
