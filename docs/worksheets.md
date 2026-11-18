# Worksheets – print rule, format and building blocks (draft 1, 2026-11-18)

Printed material for the steps of a workshop: worksheets for exercises and handouts for methods. A step says how many copies of each sheet the workshop needs; the workshop exports one print package with a file per print job. Sheets are written in the app as content in a small HTML subset, like slides, and laid out by one stylesheet; files made elsewhere (a PDF from a layout program) stay possible and follow the same print rule.

Nothing of this is built yet. Stage 0 comes first and stands on its own. The format (sections 4 and 5) is a proposal until the owner's sample worksheets have been rebuilt in it (stage 1).

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

- **One file per print job.** A job is what a copy shop is told once: copies × paper × one- or two-sided, for example `30x A4 einseitig.pdf`, `2x A3 doppelseitig.pdf`. Orientation is not part of it; pages turn by themselves.
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

- A sheet has a title, a version label and date for the footer ("v1.0 · Nov 2026"), a paper size, one- or two-sided, and its pages. A page is one `section.sheet` with an orientation and its blocks.
- The host adds what the page must not contain: the logo, the footer line, the page number on sheets of several pages.
- Sizes are millimetres of the paper; the host scales a page for thumbnails and the editor.
- Elements, attributes and what is forbidden: as for slides (docs/slides.md, section 2). Formatting by hand names the theme's means, never values.
- Type and margins start from the guidance for classroom worksheets (section 9): body text around 12 pt, margins of 20 to 25 mm with room for punching at the left. The pitch of writing lines is open and decided on a test print.

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

A picture can stand beside or below any block (an illustration from the theme's pool or an upload).

## 6. In the app (stage 2)

- `Item.worksheets` beside `Item.slides`; the library's item content carries them, so inserting, saving, duplicating and the connector take them along.
- Thumbnails of a step's sheets in its details and on the library entry; a click opens the viewer. A print view per sheet and for all sheets of a workshop.
- The library filters by "has a worksheet". A new sheet can start as a copy of a sheet in another library entry.
- The connector reads and writes sheets as text (`worksheet_format`, list, get, add, update, remove), and a project skill like `slide-build` carries the block catalogue with examples and the check script.

## 7. Editing (stage 3)

The slide editor's shell: looking first, fields beside the live page, with a mouse on the page itself, its own history, the source behind a menu. New here: blocks are added, moved and removed; pages are added and reordered; a page reports its overflow. Starter sheets are code, like starter slides.

## 8. Themes on paper

- Derived from the theme: white ground, dark text, the accent where its contrast on white suffices (else the deeper accent), the theme's fonts, the theme's logo for paper.
- Per theme: where the logo stands (foot right, head centre, head right), the footer text.
- Per export: a black-and-white switch.

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
1. **Format and blocks, outside the app.** This file settled, the stylesheet, the v1 blocks, a check script and a static preview as for slides; the owner's sample pages rebuilt as fragments and accepted on a test print. Two of them (a picture with fields, a certificate) stay files for now.
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

- What a view guest sees of a step's sheets (stage 2).
- The second instance: every new route of the core is a decision there (`core-routes.json`), and migrations run per workspace; sample sheets for the starter pack.
- The pitch of writing lines; raster against vector after the first test print; A3 pages at 300 dpi exceed the canvas size of iOS Safari.
