---
name: sheet-build
description: Build worksheets and handouts for Session Planner in its worksheet format – plan the pages of a sheet for a step, write them as HTML in the block catalogue, check and render them at paper size with the real stylesheet, print a test PDF, and put them on a unit of a workshop or a library entry through the connector. Use when asked to write, build, make, rebuild, improve or review a worksheet, handout or "Arbeitsblatt" for Session Planner, a workshop, a step or the library. For slides use slide-build.
---

# Build worksheets for Session Planner

A worksheet is printed material of a step: a title, a paper size (A4, A3, A5) and one to eight pages. A page is one `<section class="sheet">` (or `sheet landscape`) in the slides' HTML subset: a header and a stack of building blocks. The app's stylesheet gives every page its look, the workshop's theme its fonts, colours and logo, and the server reduces every page to the format on write. The app adds the logo, the footer with the date of the last change and the page numbers; never write them.

Everything lives in the repository:

| | |
|---|---|
| `docs/worksheets.md` | decisions, the page (section 4), the blocks (section 5), print rules and the print package |
| `src/domain/sheets.ts` | `SHEET_FORMAT` (the rules in short) and `SHEET_BLOCKS` (every block: use, markup, modifiers); the connector's `worksheet_format` serves the same |
| `src/worksheets/sheets.css` | the stylesheet: what a class does, exactly |
| `scripts/sheets/examples/sheets/katalog/` | a fictional sheet with every block, three pages: the best starting point |
| `scripts/sheets/` | `check.py` (format, sanitiser, classes, pictures, overflow at paper size), `build.py` (preview and print pages), `render.sh` (screenshots and the PDF of the browser's print) |

**Private material.** Real sheets, the installation's themes and their logos are private: write and preview them in a folder outside the repository (or a gitignored `private-*/` folder), never in `scripts/sheets/examples/`, which holds fictional examples only.

## 1. Find out what the sheet is for

- **The step**: `workshop_get` (its goal, method, duration, notes) or the library entry (`library_get`). A sheet belongs to a unit (kind block).
- **Who reads it, and when**: a worksheet is filled in (questions, fields, lines to tick); a handout is read (text, terms, a list). Participants write by hand: room to write is the point of a worksheet.
- **The words**: the language of the workshop, "du" or "Sie" as the owner's material does, short instructions in the imperative.
- **The plan first**: per page one line of blocks ("header · steps · box · question fill"). For more than one page, or when the material leaves the content open, agree the plan before writing.

## 2. Write

One file per page, `NN.html`, in `<root>/sheets/<name>/` with a `sheet.json` (`{"title": …, "paper": "A4"}`); the theme of the whole folder in `<root>/preview.json` (`{"theme": …}`), its stylesheet in `<root>/themes/<theme>.css`, pictures under `<root>/assets/` as `src="assets/<file>"` (the app stores them as `asset:<hash>`).

The catalogue is the whole vocabulary; what it does not offer is not possible. In short:

- Under the root only `header` and blocks: `class="block NAME …modifiers"`. Blocks stack from the top; one `fill` block takes the rest of the page (lines, a field, rows that share the height).
- Room to write is a class: `lines-N` (9 mm apart; `pitch-l` 12 mm, `pitch-xl` 24 mm for posters), `h-N` (free space in mm), `fill`. The first line keeps air below the question by itself.
- Steps (`ol.block.steps`) and numbered questions count across the page; never number by hand.
- Frames: `box` (one field), `grid` (`g-2`, `g-3`, `g-2x2`, `g-wide`; `ruled` for topics side by side without frames), `rows` (label and field), `criteria` (a value and notes). Two columns of blocks: `pair`.
- Nothing flows to the next page. Write what fits, and make a second page where it does not.
- Pictures only as assets the workshop or library already shows, or the theme's pool (`theme_pool` with `kind: illustration` and a `query`: paper shows a picture whole, so the pool's illustrations suit it); no drawings written by hand.

## 3. Check and look

From the repository:

    python3 scripts/sheets/check.py <root>/sheets/<name>/
    python3 scripts/sheets/build.py <root>
    scripts/sheets/render.sh <root>/<name>.html

`check.py` must pass: it fails on what the sanitiser would remove, blocks the catalogue lacks, missing pictures, and – rendered at paper size – blocks past the bottom margin and text leaving its frame. Then look at every screenshot in `<root>/shots/`: room to write on each question, frames that read as groups, nothing crowded at the foot. `render.sh <root>/all.print.html` prints every A4 sheet of the folder into one PDF for a test print.

## 4. Put it into the app

- **A unit of a workshop or a library entry**: `worksheet_add` with `title`, `paper` and the pages (`pages` as a list, or `source` with a section per page); pictures must be `asset:<hash>` references already shown there. `worksheet_update` changes one page (`page` + `html`), replaces exact text (`replace`), or swaps all pages; `worksheet_get` shows the markup as stored. The date in the footer follows every change.
- **How many to print**: `print_rule` sets the rule of a step's PDF; the workshop's participants come from `workshop_update`. Rules for sheets written in the app follow with the print package (stage 2b).
- After uploading, the owner sees the sheet in the step's details and prints it from Output → "Print worksheets" (a vector PDF through the browser).
