# Slide builds – slides that build up step by step (draft 2, 2026-11-26)

A slide can come on in parts: the title first, then its points, cards or steps one after another, on a click or by itself. The aim is a guided way through the content: the room sees one thing, hears about it, then sees the next. Stage 1 of four is built (section 10, with what it does differently from the proposal); the rest of this draft is a proposal, and its choices are open until the owner takes them.

Words used here: a **build** is a slide that comes on in parts. A **unit** is a part that can come on by itself (a point, a card, a row). A **stage** is what one click brings: one unit, or several together. "Step" stays what it is in the app, a step of the agenda. In German: Aufbau, Stufe ("Aufbau in 4 Stufen"), since Schritt is taken by the agenda and by the exercise.

## 1. What is asked for

- Elements appear one by one or in groups, so a slide builds up.
- On a click, or timed.
- Optional: a deck without builds works as it does today.
- Strong defaults: switching a build on gives a good one without a second decision.
- Adjustable, without anything new on the screen of somebody who never uses it.

## 2. Decisions proposed

Each with its strongest counter-argument, what would show it to be wrong, and what is not known. Stage 1 was built on 1, 2, 4, 5, 7, 8 and 9 as they stand here, on the owner's go-ahead of 2026-11-26; 3 and 6 wait for stage 3.

| # | Proposed | Strongest counter-argument | Shown wrong if | Not known |
|---|---|---|---|---|
| 1 | **A build is a property of the slide, written into its markup as classes** (`build` beside the layout). It travels wherever the markup goes: library, copies, templates, the pool, the connector, the HTML file. No new field, no migration. | Behaviour of the presentation now sits in the content's text. Once library entries carry the class names, they cannot be renamed without touching every stored slide: this one is hard to take back. | A build needs something classes cannot say (an order that differs from the reading order, a time per stage) on more than the odd slide. | How often the owner wants another order than the reading order. |
| 2 | **The layout knows its units.** One switch per slide turns the build on, and the layout decides what a stage is (section 4). No animating of single objects. | A facilitator who knows PowerPoint expects to animate anything, the picture and the title too. | Real decks need builds the table of section 4 cannot hold, beyond `model` slides. | Which of the owner's existing decks used builds, and on what. The import drops builds made by copying (`dropBuilds`), so the translated decks no longer show it. |
| 3 | **The slide says what comes in which order; the theme says how it moves.** As with formatting by hand: the slide names, the theme decides the look. One motion per deck. | One slide that should move differently from the rest cannot. | The owner asks for a per-slide effect after using it. | — |
| 4 | **The default motion is small**: a fade with a rise of 12 px in 280 ms. "Fly in" is a choice of the theme, not the default. | The request says "fly in"; a small motion may read as no animation at all on a weak projector. | In the room the stages are not noticed as arriving. | How the values read on a projector at ten metres; they were only judged on a screen. |
| 5 | **The first click brings the first unit**: a build comes on with its header alone. A slide never comes on empty: without a header, the first unit comes with the slide. | One more click per slide, and a slide that stands half empty while the title is spoken. | The owner marks the first unit "from the start" on most builds. | — |
| 6 | **On a click by default; timed is chosen per slide** and runs at a reading pace computed from the words. A timed build never leaves its slide. | In a room the facilitator's speech sets the pace, not a clock; a timed build that runs ahead of the speaker is worse than none. | Timed builds are switched on and then switched off again after the first workshop. | Whether timed is wanted in the room at all, or only for the HTML file somebody reads alone. |
| 7 | **Everywhere but in a presentation a slide stands whole**: thumbnails, the editor, the library, print and PDF. | Somebody who presents from the PDF loses the build. | That is the common way to present. It is not: the app presents. A page per stage is an option of the PDF (section 8). | — |
| 8 | **Nothing moves its place.** A unit that has not come yet keeps its room; it arrives where it will stand. | A short list that grows from the top would look calmer than a list with a hole below it. | The owner's signature, content at the bottom edge, looks wrong with its upper rows still missing. | How the bottom-aligned content reads half built; the prototype shows the default theme only. |
| 9 | **The presenter view shows what is still to come, faintly**, on the current slide, and the stages as dots. The next-slide preview stays the next slide. | The preview could show the next stage instead, as Keynote does. | Facilitators look at the preview, not at the current slide, to know what a click brings. | — |

## 3. What research says, and what it does not

- **Segmenting helps, modestly.** A meta-analysis of the segmenting effect (Rey, Beege, Nebel, Wirzberger, Schmitt and Schneider, 2019, Educational Psychology Review 31, 389–419; 56 investigations, 88 pairwise comparisons) reports small to medium effects on retention and transfer when a lesson is cut into parts, also when the system sets the pace, and a longer learning time. The founding experiment let learners start each part of a narrated animation themselves (Mayer and Chandler, 2001, Journal of Educational Psychology 93, 390–397). [BELEG? its sample was not read for this draft.]
- **Bullets that arrive one by one have also done worse.** Mahar, Yaylacicegi and Janicki (2009, International Journal of Innovation and Learning 6(6), 581–592) recorded one lecture twice, with the points of each slide animated in and with every slide shown whole; the students who saw the whole slides scored better. [BELEG? sample and scores not read: only the abstract and summaries of it were reachable.]
- **Reading rate**, for the timed pace: 238 words a minute for adults reading non-fiction silently in English (Brysbaert, 2019, Journal of Memory and Language 109, 104047; 190 studies, 18,573 participants). That is 0.25 s a word.

What follows from it is this draft's reading, not a finding. Cutting a continuous lesson into parts is not the same as holding back the lines of a list, and both bodies of work are about students and recorded lessons, not about a facilitated group; the transfer is assumed. The two results fit together if a build helps where the room should take one thing in before the next (a question before its answers, a model part by part, a sequence) and hurts where it only withholds context from people who would read the list in ten seconds. So: off unless switched on, never a deck-wide default, and the connector's format tells an assistant to use it sparingly.

## 4. The model

**Stage 0** is the slide as it comes on: its header and what stands from the start. Every click brings the next stage. After the last, the click pages on.

| Layout | A unit is | Stands from the start |
|---|---|---|
| `list`, `section` with points | a point with its sub-points | header, the illustration beside the text |
| `cards`, `number` | a card, a figure | header |
| `steps`, `timeline` | a step, a dated point; the line reaches as far as is shown | header |
| `exercise` | a step of the task | header (the question), the facts panel |
| `compare` | a side | header |
| `acronym`, `canvas` | a letter with its meaning, a box | header |
| `table`, `agenda` | a row | header, the table's head, the picture |
| `matrix` | a cell, in reading order | header, the axes |
| `split` | a text block | header, the picture |
| `statement` | the line under the sentence (`p.sub`) | the sentence, the illustration |
| `quote` | who said it (`cite`, `p.sub`) | the quotation |
| `diagram` | an entry with its part of the drawing | header (later stage: the drawing must name its parts first) |
| `title`, `break`, `closing`, `figure`, `model` | not offered: nothing to build | |

- The **takeaway** of a content slide is a last stage of its own: it is the conclusion. The **source** stands from the start.
- A slide with nothing to build is not offered the switch. One unit is enough: the line under a question is a build.
- **Adjusting** changes two things per unit and nothing else: "with the one before" (two units come together, which makes a group) and "from the start". The order is the reading order. A unit that comes with one that stands from the start stands from the start too.
- Switching a build off takes its classes and marks out of the slide; undo brings them back.
- **Per slide**: on a click or by itself; and, for adjusting, whether earlier stages stay or step back (dimmed, so the newest stands out), and whether sub-points come with their point or one by one.

**In the format** (docs/slides.md, section 2). Classes only; the sanitiser already lets them pass, and no element or attribute is added. Of these, only `build` is in the format since stage 1; the others are proposed names, free to change until their stage writes them into a slide:

```html
<section class="slide cards build">                       the layout's default, on a click
<section class="slide list build build-auto">             by itself, at reading pace
<section class="slide list build build-dim build-fine">   earlier stages step back; sub-points one by one
<li class="with-prev">…</li>                              comes with the unit before it
<li class="from-start">…</li>                             stands from the start
```

`build-auto` takes `build-quick` (a cascade, 0.7 s a stage) or `build-slow` beside it. The slide document reads `build` and its modifiers as options of the layout and the two marks as a field of the entry, so a slide with a build keeps its fields; changing the layout keeps the build where the new layout has units, and a mark stays with its entry where the entry is carried.

**How it is shown.** A pure function (`src/domain/build.ts`, shared by browser and server) reads a slide's stages from its markup and numbers the units for the host (`data-b`, as the host adds the footer line: never stored, and the sanitiser would drop it). The numbers are put into the tags as they stand; the markup is not parsed and written anew, so nothing else of it can change. The host sets the stage shown (`src/slides/build.ts`); `slides.css` holds the rules, which count only on an element the host numbered. A unit that waits is `visibility: hidden`, so it keeps its room and a screen reader does not read ahead. Where no stage is set, everything shows. The hairline that closes a list or the steps of an exercise belongs to its last row and comes with it; left standing, it floats under the gap.

**Tried** (2026-11-26) in a prototype outside the repository: the rules above on `slides.css` and the default theme, for list, cards, steps, timeline, statement, compare and exercise, with the presenter's faint rest, the timed pace and the build view of section 5. The rules needed nothing from the layouts but the hairline above. What it shows about decision 8: with the content at the bottom edge, a build stands with a gap between the header and the first row and another below the last row shown, until it is whole. Whether that reads as a slide being built or as a slide with a hole is the owner's to judge by looking.

**Motion** belongs to the theme (tokens `--build-effect`, `--build-ms`): appear, fade, rise (the default) or fly in, at a quick, normal or calm speed; the playful family may bring its own. Units of one stage follow each other 60 ms apart. Going back takes a stage away without motion. With `prefers-reduced-motion` a stage appears without moving. Since stage 1 the rise is the one motion, fixed in the stylesheet (280 ms, 12 px); the choice and the 60 ms come with stages 3 and 2.

**The timed pace.** After a stage the next waits 1.2 s plus 0.25 s for every word just shown, at least 1.5 s and at most 8 s. The values are a start, to be tried.

## 5. Editing

Proposal A is recommended. B and C are what was weighed against it. Built with stage 1: the switch and the line under it ("While presenting, the slide comes on in 4 stages, on a click each."); "Adjust" and its view are stage 2.

**A. One switch, and a view of its own for adjusting.** The switch stands with the layout's options, where the flags of a layout are today; a layout without units does not show it.

```
Appearance
[ Numbered ]  [ Plain ]  Columns (2)(3)(4)    [ Build up ]
```

Switched on, one line says what it does, and that is all most slides need:

```
[ Numbered ]  [ Plain ]  Columns (2)(3)(4)    [■ Build up ]
4 stages · on a click                              Adjust ›
```

"Adjust" opens the build view: the slide large, every unit with the number of its stage, the stages as a strip below it.

```
┌──────────────────────────────────────────────┬────────────────────────┐
│  Three kinds of feedback                     │ Comes on               │
│                                              │ (•) on a click         │
│  ①             ②             ③               │ ( ) by itself          │
│  Appreciation  Coaching      Evaluation      │                        │
│  …             …             …               │ Earlier stages         │
│                                              │ (•) stay  ( ) step back│
│  ④ One kind at a time                        │                        │
│                                              │ As the layout builds   │
│ [0] [1] [2] [3] [4]    ▶ Play                │                        │
└──────────────────────────────────────────────┴────────────────────────┘
```

- A click on a unit gives it one of three: a stage of its own, with the one before, from the start. The numbers follow at once.
- A click on a stage of the strip shows the slide at that stage; Play runs through them as the room will see them.
- "As the layout builds" takes every adjustment back.
- On a phone and a touch screen the same as fields: under the switch the units as a list, each with the three choices. Nothing is done on the slide there, as with all editing.

Where a build shows while not adjusting: a small sign with the number of stages in the line under a thumbnail (the deck tab, the editor's strip), nothing on the slide itself. Looking at a slide shows it whole; a slide that builds has "Play" beside "Edit".

**B. A build section that is always there**, with the list of stages, like PowerPoint's animation pane. Left out: it shows machinery to everybody for the few slides that use it.

**C. No view; "with the one before" in every entry's menu.** Less to build, and it is the phone's form of A. Left out as the only form: nobody sees the whole build, and nobody finds the menu.

New slides, starters and blank layouts come without a build. A template keeps the build it was saved with.

## 6. Presenting

- **A click, the arrow, the space bar, a swipe and the remote's Next bring the next stage**, then the next slide. Back takes the last stage away; from stage 0 it goes to the slide before, whole. Jumping to a slide (the grid, Home, End, "Present from here") starts it at stage 0.
- **Shift with an arrow pages whole slides. A shows all of this slide at once**: for when time runs short.
- **Every window follows the stage.** The presentation's position becomes slide and stage (`PresentPosition.stage`); the server keeps it, a window that joins lands on it, and without the server the windows of one browser pass it over the broadcast channel as they do the slide. A slide changed meanwhile to fewer stages shows its last.
- **The presenter view** shows the current slide with what is still to come at about a quarter of its strength, and the stages as dots beside the slide's number. A dot is a button.

```
┌───────────────────────────────┬─────────────────┐
│ current slide:                │ Next slide      │
│ shown in full,                │ [ thumbnail ]   │
│ still to come faint           │                 │
├───────────────────────────────┤ The step, its   │
│ ‹ 7 / 24 ›  ● ● ○ ○ ○  Show all                 │ time and notes  │
└───────────────────────────────┴─────────────────┘
```

- **On a phone** the dots and "Show all" stand in one line above the two large buttons, which stay as they are.
- Built with stage 1: all of the above. The buttons that page say Back and Next, since they no longer always change the slide. Stages 2 and 3 bring what follows.
- **Timed**: the window that brought the slide on counts and pages the stages like clicks, so every window sees the same. A click brings the next stage at once, Back stops the run on this slide, and the presenter view shows the wait as a ring with Pause.
- **"Play builds"** is a switch of the deck, beside "agenda slides" and "break slides", remembered on the device like them. Off, every slide comes whole.

## 7. Settings

One place per kind of thing; no setting of the app as a whole.

| Where | What |
|---|---|
| The slide (editor) | whether it builds, what comes together, on a click or by itself |
| The theme (theme editor, a row "Motion") | the effect and the speed, played on the sample slide beside it |
| The deck (the Slides tab's switches, per device) | play builds or show slides whole |
| The output (Output menu) | PDF with a page per stage |

## 8. Output, import and the connector

- **Print and PDF**: the slide whole. The PDF can be written with a page per stage for presenting from the file; off unless asked for.
- **The HTML file** plays the builds (since stage 1): the rules are in the stylesheet it already carries, the script grew by a few lines. Timed builds run there too, which is the case of somebody reading the deck alone. Printed, it is whole.
- **PowerPoint**: whole slides at first, named among the export's limits. Later the stages as PowerPoint's own entrance animations: the export knows which shapes come from which element. This needs trying in PowerPoint itself, where the export has not been opened yet.
- **Import**: a deck that builds by copying its slides is already recognised and reduced to the last copy. That slide could be marked `build`; so could a slide whose file animates its paragraphs.
- **The connector**: `slide_format` names the class and when a build is right (the room should meet the points one at a time; never on every slide; never to rescue a slide that is too full), since stage 1. No new tool. Still open: the check script warning about a build with nothing to build; it knows the word `build` and nothing more.

## 9. How other tools do it

- **Beautiful.ai** sets animation per slide: none, on click, auto or custom; auto lets the elements follow each other at normal speed, custom opens delays and speed (support article "Understanding Slide Animations").
- **Keynote** animates a text box as a whole and offers its delivery: all at once, by bullet, by bullet group (sub-points with their point), and by highlighted bullet, where the earlier ones dim (Apple's Keynote guide, "Animate objects"; the last from a MacMost tutorial).
- **reveal.js** marks elements as fragments, shown in the order of the document, with the effect as a class (revealjs.com/fragments).
- **PowerPoint and Google Slides** animate single objects, with "by paragraph" and "on click, with previous, after previous"; **Marp** builds a list written with another bullet sign; **LaTeX beamer** has overlays and a handout mode that prints every slide whole.

The tools with fixed layouts animate by the slide's structure and ask one question per slide. The tools with free placement animate objects and need a pane to keep order. The catalogue puts this app with the first group.

[BELEG?] The first three were read in November 2026 as summaries of the pages named, not the pages themselves. PowerPoint, Google Slides, Marp and beamer are from memory.

## 10. Stages

1. **The core** – done (2026-11-26): the stages of a slide as a function, the rules in the stylesheet, the switch in the editor, presenting on a click in every window, the faint rest and the dots in the presenter view, the HTML file. The layouts of section 4 without diagram and matrix. This alone meets the aim of section 1 except "timed" and "adjustable".
2. **Adjusting**: the build view, the two marks, sub-points one by one, earlier stages stepping back, the fields on touch screens, the sign under thumbnails, Play while looking.
3. **Timed, and the theme's motion**: the pace, the ring in the presenter view, effect and speed in the theme editor, "Play builds" for the deck.
4. **The rest**: diagram and matrix, the generated agenda slide, a page per stage in the PDF, PowerPoint animations, builds from an imported deck.

A stop after stage 1 is a sensible one: a workshop presented with it shows whether 2 and 3 are needed, and which half of each.

**Stage 1 as built**, where it differs from the proposal or settles what the proposal left open:

- One word is written into slides, `build`. The marks and modifiers of section 4 are not read yet, so nothing of them is fixed.
- The stylesheet's rules hang on the host's numbers alone (`.slide [data-b].b-wait`), not on `.slide.build`: in `slides.css` a class joined to `.slide` names a layout, and a test keeps it so. A side effect that is wanted: a class `b-wait` typed into a slide does nothing.
- A slide kept wholly as source has no fields and so no switch; the class is typed into its source. A slide whose body alone is source has the switch.
- The line that closes a list, the steps of an exercise and an agenda comes with its last row.
- The host's marks hold against a theme (2026-11-26, after the walk through the owner's themes): hidden and faint are `!important` and count on a screen only (`@media not print`). The playful family dims the line under a statement itself (`opacity: 0.85`, `src/domain/families.ts`), with more weight than the stylesheet's rule: in the presenter view that line looked shown while the room had not seen it. A theme laid over an older stylesheet weighs its rules with an id and would have kept a list's closing line. A test keeps the three rules so (`server/skill.test.ts`).
- The motion of a stage ends when it has run (`backwards`, not `both`). Left on the element it kept the unit a layer of its own for as long as the slide stood, so a slide that was built was no longer the same as one shown whole.
- The facts of an exercise stand from the start, and a pyramid is not built at all yet (section 11).
- A position without a stage reads as the slide as it comes on, so a window from before the builds and one from after page together.
- Left for stage 2, as planned: the sign under thumbnails and "Play" while looking at a slide.

Checked in the running app, in Chromium: two windows of one presentation step through a list and cards from either window, A, Shift with an arrow, a dot, the way back to a slide whole, the grid, a window that joins later; the switch in the editor, with the room's window following the change; the exported file, on screen and as print.

Checked against the owner's themes (2026-11-26), in the built app with its content security policy, on a copy of the local demo: a deck of 52 slides, the 26 that can build switched on (split, cards, exercise, statement, list, quote), walked stage by stage in the room's and the presenter's window under seven themes (the profile theme light and dark, the playful school theme, both client themes with rules of their own, the theme laid over the old stylesheet, a folder theme). At each of the 187 steps: what waits is hidden with everything inside it, what has come shows, the presenter's rest is faint, the room follows the presenter, the dots agree, and no element stands elsewhere than at the stage before. It found the two points above; after them every theme passes, and nothing is refused by the policy. On paper (print media) a slide in the middle of its build shows whole.

Not checked: a phone as remote, a projector, Safari and Firefox, and the themes of any installation but the local demo.

## 11. Open

- Whether the facts of an exercise stand from the start or come last ("you have twenty minutes").
- Whether a pyramid builds from its first entry or from its base.
- `model` slides: a build by the top-level groups of the drawing would need them marked by whoever draws.
- A build for the generated agenda slide would be kept on the workshop, like a title slide's variant.
- The German words in the app, as built: "Schrittweise aufbauen" for the switch, "Stufe" for a stage, "Alles zeigen", "Zurück" and "Weiter". The owner may want others.
- Whether a section slide's points should build: they do, since they are a list; the title stands.
