# Worksheets – print rule, format and building blocks (draft 1, 2026-11-18)

Printed material for the steps of a workshop: worksheets for exercises and handouts for methods. A step says how many copies of each sheet the workshop needs; the workshop exports one print package with a file per print job. Sheets are written in the app as content in a small HTML subset, like slides, and laid out by one stylesheet; files made elsewhere (a PDF from a layout program) stay possible and follow the same print rule.

Stage 0 (print rules and the print package), stage 1 (the format, outside the app), stage 2 (sheets in the app, with the print package) and stage 3 (the editor, with fields and typing on the page) are built. The format (sections 4 and 5) is settled: the owner accepted the test print of the rebuilt sample sheets on 2026-11-18.

No client, partner or brand names in this file. The owner's sample worksheets are private material and stay outside this repository.

## 1. Decisions (2026-11-18)

- **Sheets belong to steps, and everything is a copy.** A sheet is content of an agenda item, next to its slides and files. The library keeps it with the entry; inserting an entry copies it, saving a step to the library copies it back. This is the one rule the app already has for slides and files.
- **No central collection.** A collection with live references from the library ("a change there changes every entry") was considered and dropped: it would have been the first live reference in the app, with its own rules for deleting, exporting and guests. The price: a sheet used in several library entries exists as independent copies, and a correction is made in each. The decision can be reversed later; it reopens when the same sheet has to be kept in step in several entries regularly.
- **Building blocks, not page layouts.** A slide picks one layout. A sheet is a frame (kicker, title, footer with version and logo) around a stack of blocks: an intro, steps, a question with lines, a field. Most of the owner's sample pages combine several of them, which whole-page templates cannot hold. The price is an editor with more to it than the slide editor, which is why the editor is stage 3.
- **Content, not pixels.** The same HTML subset, the same sanitiser on write and on render, pictures as assets, no `style`, nothing dragged or resized. What a block does not offer is not possible.
- **Pages are explicit.** A sheet lists its pages, each portrait or landscape. Content that does not fit a page is reported as overflowing, as on a slide; nothing flows to the next page by itself.
- **One print rule per sheet, and few numbers on screen.** A sheet shows one choice: off · per person · per group · once · count. A number shows only where the choice needs one. The number of groups is 1 unless set by hand, is stored on the step (several sheets of a step share it) and shows only beside "per group". There is no separate "group activity" switch on a step; that reopens when the number of groups is needed outside printing (material quantities, the exercise slide).
- **Files made elsewhere stay.** A PDF attached to a step takes the same print rule. Such files are not read and not merged: paper size and one- or two-sided are set by hand, and each file is a file of its own in the package. No PDF library.
- **A theme on paper is a print profile.** Worksheets take the logo, fonts and accents of the workshop's theme on a white ground. This revises "the printouts stay black on white" (docs/concept.md, 2026-11-04) for worksheets only; the agenda printouts stay as they are. A dark theme cannot be used as it is: its ground becomes white, its text dark, an accent is used only where it carries enough contrast on white.
- **PDF from the app's own writer.** Pages are drawn by the browser and written by `src/slides/pdf/pdf.ts`, generalised to paper sizes, at about 300 dpi. A vector PDF (embedded fonts) is built only if a test print shows it is needed.

## 2. Print rule and counts (stage 0)

```ts
type PrintMode = 'off' | 'person' | 'group' | 'once' | 'count'
type Paper = 'A4' | 'A3' | 'A5'
interface PrintRule {
  mode: PrintMode
  /** Only for mode 'count'. */
  count?: number
  paper: Paper        // default 'A4'
  duplex: boolean     // default false
}
```

- `Workshop.participants: number | null`, one field in the workshop's details.
- `Item.groups: number`, default 1.
- A print rule per file of a step (stage 0) and per sheet of a step (stage 2). For files the rule is kept on the item and keyed by the attachment's id; wherever attachment ids are mapped to new ones (inserting a library entry, saving to the library, duplicating) the rules are mapped with them.
- Copies: per person = participants, per group = the step's groups, once = 1, count = the number typed. A reserve (for example 2 more per job) is a setting of the export dialog, remembered per device like the print switches, not a field of a sheet.

On screen:

- On a file or sheet: the one choice. "per group" shows "× 1" beside it, which sets the step's number of groups; "count" shows its number field. Paper size and one- or two-sided sit behind a disclosure.
- Without a number of participants, the export asks for it before it writes the package.

## 3. The print package

The workshop's Output menu gets "Print package (ZIP)".

- **One file per print job.** (Stage 2b: PDFs made elsewhere come as files of the ZIP; the jobs of worksheets written in the app are printed from the print view, one PDF per job, see section 6.) A job is what a copy shop is told once: copies × paper × one- or two-sided, for example `30x A4 einseitig.pdf`, `2x A3 doppelseitig.pdf`. Orientation is not part of it; pages turn by themselves.
- **Sheets written in the app** are merged per job, in agenda order. In a two-sided job every sheet starts on a new leaf (a blank page is added after an odd number of pages).
- **Files made elsewhere** are not merged: `30x A4 einseitig – <file name>.pdf`.
- **A print list** in the package and as a view: sheet, step, rule, copies, job. The same lines join the packing list.
- Parked steps print nothing.

## 4. The sheet

```html
<section class="sheet">
  <header>
    <div class="eyebrow">Arbeitsblatt Transfer</div>
    <h1>Was ich mitnehme</h1>
    <p class="lead">Wähle wenig – und fang diese Woche damit an.</p>
  </header>
  <div class="block ticks"> … </div>
  <div class="block lines"> … </div>
</section>
```

- A sheet has a title, a paper size, one- or two-sided, and its pages. Its footer shows the date of its last change ("Stand 18.11.2026"), set by the app, never typed (decided 2026-11-18 on the first test print: a typed version label goes stale). The theme is the workshop's, as for slides: a sheet carries none, and every sheet of a workshop is branded alike. A page is one `section.sheet`, or `section.sheet.landscape`, with its blocks.
- The header holds an eyebrow, the title (`h1`), one or two leads and optionally a small picture (`figure`) at its right.
- Under the root stand only blocks: `class="block NAME"` with a name of the catalogue (section 5) and modifiers. The blocks stack from the top; one block with `fill` takes the rest of the page.
- Heights and writing room are classes, never values: `h-N` (N millimetres: 10 … 140), `lines-N` (N writing lines), `fill`; the line pitch is 9 mm, `pitch-l` 12 mm, `pitch-xl` 24 mm (for posters). The first line keeps 0.6 of a pitch of air below the text above it, so handwriting on it does not run into the question (the first test print). A picture's width is `w-N`. A blank inside a sentence is `span.blank` (`short`, `long`), a line of its own `p.fill-in`.
- Formatting by hand as on slides: `fs-xs fs-s fs-l fs-xl`, `accent`, `muted`, `fw-normal`, `strong`, `em`.
- The host adds what the page must not contain: the logo where the theme puts it (`.sheet-head` at the top, centred or right, with `logo-head` on the root for the room; or in `.sheet-foot`), the footer line with the date of the last change and, on sheets of several pages, the page number. The paper size is a class of a wrapper: `paper-a3`, `paper-a5`, A4 without one.
- Sizes are millimetres and points of the paper; the host scales a page for thumbnails and the editor.
- Elements, attributes and what is forbidden: as for slides (docs/slides.md, section 2), with the slides' sanitiser (`src/domain/sheets.ts`); the root is `section.sheet` instead of `section.slide`. A circle is drawn from its entries, as slide diagrams are.
- Type and margins: body 11 pt, lead 11.5 pt, title 19 pt, hints 9.5 pt; margins 16 mm at the top, 17 mm right, 24 mm at the bottom (the footer) and 22 mm at the left for punching. The pitch of writing lines (9 mm) is decided on the test print.
- On paper the theme gives the fonts, the text colour, the title colour and the deeper accent (numbers, the eyebrow's place, `accent`); the ground is white, frames are thin and black, writing lines thin and grey, nothing is filled. A dark theme is not yet turned into a print profile (stage 4).

**Tools** (`scripts/sheets/`, as `scripts/slides/` for slides): `build.py ROOT` writes a preview per sheet, a print page per sheet and one for all A4 sheets; `check.py` checks pages against the format (sanitiser, blocks, classes, pictures, and rendered: overflow at the bottom margin, text leaving its frame); `render.sh` takes screenshots and prints PDFs with the browser, which is the test print of stage 1. A sheet is a folder `ROOT/sheets/<name>/` with `sheet.json` (title, paper) and one `NN.html` per page; the folder has one theme (`ROOT/preview.json` or `--theme`), as a workshop has, and the footer date is the newest file of the sheet; `scripts/sheets/examples/` holds a fictional catalogue sheet with every block. The stylesheet is `src/worksheets/sheets.css`.

## 5. Building blocks

Grouped by what participants do with the sheet. **v1** is what stage 1 builds; the rest follows in stage 4.

| Group | Block | v1 | Notes |
|---|---|---|---|
| read | text (paragraphs, headings, bullets) | ✓ | |
| read | definition list (term and explanation) | ✓ | |
| read | list in columns, with optional numbers and section headings | ✓ | |
| read | table | ✓ | also with empty rows to fill in |
| read | note box, model drawing (the slide diagrams and `model` SVG) | | |
| instruct | steps of an exercise (title, hint, optional time) | ✓ | |
| instruct | facts line (duration, format, material) | | filled from the step |
| write | question with lines or free space | ✓ | number of lines or a height |
| write | box with a prompt | ✓ | |
| write | sentence starters | | |
| order | grid of fields (2 × 2, one wide over 2 × 2, a row of three) | ✓ | |
| order | rows with a label and a field | ✓ | |
| order | circle with segments and an open middle | ✓ | |
| order | matrix with axes, two columns against each other, timeline or day grid, the diagram shapes empty to fill in | | |
| rate | criteria rows with a value and notes | ✓ | |
| rate | scale 0–10, checklist, self-test with scoring | | |
| plan | lines with a box to tick | ✓ | |
| plan | if-then plan, appointment fields | | |
| page kinds | poster (landscape, large type), cards to cut out, certificate, placemat on A3 for groups, picture with fields | | |

A grid can be `ruled`: no frames, the fields divided by thin rules, for a page of several topics side by side, each a field holding blocks of its own. Built in stage 1, besides the twelve: `write` (writing room on its own, or inside a step, field or row), `picture`, `pictures` (a row with captions) and `pair` (two columns of blocks; `r-2-1`, `r-1-2`, `r-3-2`). A picture can so stand beside or below any block (an illustration from the theme's pool or an upload). The circle shows its segments, not yet words in them.

The markup of each block, with its modifiers, is in `SHEET_BLOCKS` (`src/domain/sheets.ts`), which the check script and later the connector read.

Stage 4b, built 2026-11-18, adds nine blocks, each with its fields in the editor and in the connector's catalogue:

| Group | Block | What it is |
|---|---|---|
| read | `note` | a note to remember, set apart by a rule in the accent |
| instruct | `facts` | the step's duration, method and material, filled in by the app from the step the sheet is on (empty in the library preview of an entry without them) |
| write | `starters` | sentence starters, each continued on its line; `lines-N` adds lines below |
| order | `matrix` | a 2 × 2 with an axis up and one across, a field per quarter |
| order | `timeline` | marks across the page with room to write above them |
| order | `shape` | a diagram shape of the slides (pyramid, cycle, venn, onion, pillars, hub) as an outline to fill in, drawn from its entries like the circle, the entries numbered below |
| rate | `scale` | scales from 0 to 10 (`s5`: 1 to 5) with words at both ends; the points are drawn by the app |
| rate | `selftest` | statements with a box per answer column (2 to 6) and a sum line |
| plan | `ifthen` | if-then plans, each part continued on its line |

Still open from section 5: checklists (ticks with text cover them), appointment fields (a grid of three covers them).

## 6. In the app (stage 2)

Stage 2a, built 2026-11-18:

- `Item.worksheets` beside `Item.slides`: each sheet with an id, a title, a paper size, its pages (id and markup) and `updatedAt`, the date its footer shows. At most 10 sheets on a step, 8 pages on a sheet; units (kind block) have them. The library's item content carries them, so inserting, saving, duplicating and the connector take them along, with new ids. Their pictures count as held by the workshop and the library, like the pictures of slides.
- Thumbnails of a step's sheets in its details and on the library entry; a click opens the viewer with every page. Each sheet's ⋯: view, print, edit the source, duplicate, remove. A new sheet starts from its source (title, paper, the pages as one text with a live preview; sanitised on saving) or as a copy of a sheet in the library. The editor proper is stage 3.
- The host adds the footer: the date of the last change, the page number on sheets of several pages, the logo of the workshop's theme (or the owner's printout logo); in the library the settings' theme. Where the theme puts its logo is stage 4; for now always at the foot.
- A print view (`/w/:id/print/sheets`, Output → "Print worksheets", or one sheet with `?sheet=<id>`): the sheets of placed units in agenda order, each page on a named page of its paper and orientation, printed by the browser into a vector PDF, as the accepted test print of stage 1 was.
- The library filters by "with worksheet".
- Guests see a workshop's sheets as they see its slides: they are participants' material, not facilitation notes (decided 2026-11-18). Guests who may edit can edit them.
- The connector: `worksheet_format`, `worksheet_list`, `worksheet_get`, `worksheet_add`, `worksheet_update`, `worksheet_remove`; and, closing a gap of stage 0, `workshop_update` sets the participants, `item_update` a step's groups, `print_rule` the rule of a step's PDF. The project skill `sheet-build` carries the workflow with the check script.

Stage 2b, built 2026-11-18: sheets in the print package (section 3).

- A sheet takes the same print rule as a PDF, keyed by its id in `Item.printRules`; its paper is its own, so only one- or two-sided sits behind the disclosure. Wherever sheets get new ids (inserting, saving, duplicating) their rules are keyed anew with them (`copyPrinted`); a removed sheet or an unlinked file takes its rule along.
- **Sheets are printed by the browser, job by job (decided 2026-11-18).** A comparison print showed a difference between the browser's vector PDF and a raster PDF of the same pages at 300 dpi (the way the slides' PDF export works); a headless browser on the server would give the vector PDF without the dialog, but grows the container and its upkeep. So the package dialog lists the PDFs (into the ZIP, as before) and the sheets' jobs, each with "Print": it opens the job in the print view (`/w/:id/print/sheets?job=<copies>-<paper>-<1|2>`, with the reserve and participants used), its sheets in agenda order, an empty page after a sheet with an odd number of pages in a two-sided job, and the job as the page's title ("30x A4 doppelseitig – Teamtag"), which the browser offers as the PDF's name. The print list in the ZIP names every job, sheets included, with where each comes from.
- Printed sheets join the packing list like printed files. The connector's `print_rule` takes a worksheet's title as well as a file's name.

## 7. Editing (stage 3)

The slide editor's shell: looking first, fields beside the live page, its own history, the source behind a menu. New here: blocks are added, moved and removed; pages are added and reordered; a page reports its overflow. Starter sheets are code, like starter slides.

Stage 3a, built 2026-11-18:

- **The page document** (`src/domain/sheetDoc.ts`): a page is read into its orientation, header and blocks, each block with the fields of its kind, and written back in the catalogue's markup. A block is offered as fields only when writing it back shows the same block; otherwise it stays as source, untouched, and so does a header the fields cannot hold. Empty elements count in the comparison: on a sheet an empty field, row or line is the point. In text fields, blanks are underscores (`___`, `__` short, `____` long) beside the slides' inline markup. The pages of the stage 1 samples and the catalogue read back unchanged; two blocks of the samples (a heading of the poster's size in a question, a grid whose fields hold blocks) stay source.
- **The editor** (`src/worksheets/editor`) replaces the viewer: it opens for looking (arrows page, E edits), "Edit" brings the fields beside the page – the sheet (title, paper), the page (orientation), the header, the blocks as cards with ⋯ (up, down, duplicate, remove) and their fields: the block's shape (modifiers as a choice or switches, height, writing lines, "fills the rest"), and its content. Blocks are added from a menu grouped as the catalogue is; a pair holds two lists of blocks. Pages are added, duplicated, moved and removed below the page; the source of a page is in the ⋯ menu. A click on a block of the page opens its card.
- **Overflow**: the page names how many blocks run past its bottom margin, and each such card says by how many millimetres.
- **History and saving**: undo and redo cover every change in the editor; typing in one field is one step while it goes on. Changes are saved a moment after they are made and when the editor closes; the sheet's date follows.
- **New sheets** start from the starter sheets (`src/domain/sheetStarters.ts`): a reflection, the instructions of an exercise, a handout, fields to fill, a self-rating, a transfer plan and a blank sheet, filled with the made-up subjects of the starter slides; "Shuffle" draws again. A new sheet opens in the editor.
- Guests who may edit a workshop edit its sheets as the owner does (decided 2026-11-18).
- On a phone the page stands above the fields.

Stage 3b, built 2026-11-18 (brought forward by the owner the same day): **typing on the page**, with the slides' machinery (`src/slides/editor/inplace.ts`, `src/domain/inlineRuns.ts`; `src/worksheets/editor/onPage.ts`). With a mouse on more than a phone's width, a press on a text of the page – a title, an eyebrow, a lead, a question, a hint, a prompt, an entry of a list, a term, a cell, a caption, a step's time – makes it editable and leaves the press to the browser, so a click puts the caret there and a drag or a double-click selects words, from the first press on (2026-11-18, after the owner's test: the press was taken over, which kept the mouse from selecting); what is typed is written into the page's markup at that element's place (`setSheetInline`) and read as the page's document, so the fields follow and undo takes it back, one step per text while typing goes on. The bar above the text sets bold, italic, a size step, a colour of the theme's palette or removes formatting; Ctrl+B and Ctrl+I as well. Enter or Escape ends. While a text is typed in, the page is held still so the caret never jumps. A step's heading (it holds its time) and what a text does not hold yet – a blank, a new entry, a block – stay with the fields. Touch screens keep the fields only, as for slides.

## 8. Themes on paper

- Derived from the theme: white ground, dark text, the accent where its contrast on white suffices (else the deeper accent), the theme's fonts, the theme's logo for paper.
- Per theme: where the logo stands (foot right, head centre, head right), the footer text.
- Per export: a black-and-white switch.

Stage 4a, built 2026-11-18:

- A data theme carries `paper` in its tokens: where the logo stands on worksheets (`foot`, `head`, `head-right`, `none`; default `foot`) and a line beside the date in the footer. The theme editor sets both under "On paper". Built-in and folder themes print with the logo at the foot and no line.
- The accent on paper (`paperAccent`): the deeper accent, else the accent, where it reaches 3:1 against white; else the text colour stands in. The host hands it to the page as `--paper-accent`.
- A dark theme prints light (`paper-ink`): dark text on the white ground, its fonts kept; its own logo is made for the dark ground, so the owner's printout logo stands in, as on the other printouts.
- The print view of worksheets has a black-and-white switch (`paper-bw`: no colour, pictures in grey), remembered on the device.

## 9. Sources

What the block groups and the frame lean on. Effect sizes come from school and laboratory studies of learning from text and multimedia; none of them tested seminars with adults.

- Neumann, G. (2012). *Gestaltung von Arbeitsblättern für den Einsatz im Unterricht.* Kurzhandreichung, ISB Bayern; after Brettschneider (1993/2001). Practice guidance, no sample. Sheets with and without a task (worksheet and handout); 12 pt body text; margins of about 2.0–2.5 cm with room for punching; a head line with number, title and date. https://www.isb.bayern.de/fileadmin/user_upload/Gymnasium/Faecher/Deutsch/Arbeitstechniken/kurzhandreichung_gestaltung_von_arbeitsblaettern.pdf
- Mayer, R. E. (2014). Principles for reducing extraneous processing in multimedia learning. In *The Cambridge Handbook of Multimedia Learning.* Coherence (leave out what is not needed): median effect size 0.86, 23 of 23 tests; signaling (show the structure): 0.41, 24 of 28 tests. The sample is experiments; participants per test not read.
- Ponce, H. R., Mayer, R. E., & Méndez, E. E. (2025). Learner-generated and instructor-provided graphic organizers as aids to learning from text: a meta-analysis. *Educational Psychology Review, 37*(4), 107. Provided organizers g = 0.70 (memory, k = 37) and 0.53 (comprehension, k = 49); learner-generated 0.59 (k = 44) and 0.63 (k = 68). Read from a secondary note; k counts effect sizes, participants [BELEG?].
- Gollwitzer, P. M., & Sheeran, P. (2006). Implementation intentions and goal achievement: a meta-analysis. *Advances in Experimental Social Psychology, 38.* 94 independent tests from 63 reports, more than 8,000 participants, d = 0.65. Against it: Sheeran, Listrom & Gollwitzer (2024), 642 tests, d = 0.27–0.66 by outcome, 0.35 after a trim-and-fill correction. Both read from secondary pages.
- Rahyuda, A., Syed, J., & Soltani, E. (2014). The role of relapse prevention and goal setting in training transfer enhancement. *Human Resource Development Review, 13*(4), 413–436. A narrative review, no sample: results on transfer after trainings are inconsistent.
- Konrad, M., Joseph, L. M., & Eveleigh, E. (2009). A meta-analytic review of guided notes. *Education and Treatment of Children, 32*(3), 421–444. Guided notes improve note accuracy and performance, mainly for school-age students. Sample [BELEG?].

[BELEG?] No evidence was looked up for the scale, the circle, cards, the placemat and the self-test; they are in the catalogue because they are common in practice.

## 10. Stages

0. **Print rule and print package for files.** Participants on the workshop, groups on the step, the rule per file, the package, the print list, the packing list.
1. **Format and blocks, outside the app.** This file settled, the stylesheet, the v1 blocks, a check script and a static preview as for slides; the owner's sample pages rebuilt as fragments and accepted on a test print. Two of them (a picture with fields, a certificate) stay files for now. *Built 2026-11-18: 22 sheets with 24 pages rebuilt in the private design repository and printed to PDF; the second test print was accepted the same day (line pitch 9 mm, the type sizes of section 4, the browser's vector PDF). One of them shows two pictures of the original where the format's own models would belong (stage 4).*
2. **Sheets in the app.** Section 6, and sheets in the print package.
3. **The editor.** Section 7.
4. **More.** The print profile's choices per theme, the page kinds, the remaining blocks, a vector PDF if the test print asked for one.

## 11. Decided in stage 0 (2026-11-18)

- **Who writes the print package:** whoever sees the workshop, as with the slide exports (`GET /api/workshops/:id/print-package`, access `workshop-view`). It is built from the workshop as the caller sees it, so a guest gets only files they could download one by one, and a list of the steps they see. In the second instance this is like a single workshop's export, which members may take: nothing to close for them, the route only joins `core-routes.json` when the pin moves.
- **Where the rule of a library file lives:** in the item's content, keyed by the file's id, as in a workshop (`ItemContent.printRules`), and mapped with the ids wherever files are copied. One shape in both places; the file's record stays as it is. A file can be linked to several steps of a workshop, each with a rule of its own, which a rule on the record could not hold.
- **The number of groups stays with the workshop:** `Item.groups` is not part of an item's content, like a fixed start: a library entry inserted starts at 1, a duplicated step or workshop keeps it.
- **Only PDFs take a rule** in stage 0; other files show no choice. A file deleted or unlinked takes its rule along.
- **The words of the package** (job names, the print list) live in `src/domain/printing.ts` in German and English, as the server writes the package and the container holds no translations; the language comes with the request.

## 12. Open points

- Sample sheets for the starter pack of the second instance (later, decided 2026-11-18). Stage 2a adds no route; migration 0018 runs per workspace.
- A ZIP with the sheets' PDFs in it would need a vector PDF without the print dialog: a headless browser on the server (section 6, 2026-11-18). It reopens when printing job by job proves tedious.
- An agenda card does not yet show that its step has worksheets.
- Words in the segments of a circle; the remaining blocks and the page kinds of section 5 (stage 4).
