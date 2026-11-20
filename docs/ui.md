# The look of the app

How the app's own screens look, and the rules that keep them consistent. The slides have their own design
(docs/slide-design.md); this is about the tool around them. The tokens live in `src/index.css`, light and dark.

## The idea

The frame carries the brand, the agenda carries the day.

- **Frame**: the navigation stands on fir (`brand`), titles and times are set in fir, the one main action of a view is
  fox orange (`accent`), the ground is cream (`paper`), surfaces are white (`surface`). Shapes are round: buttons are
  pills, fields have a 12 px radius, cards 14 px. No shadows on content; only menus, sheets and dialogs float.
- **Agenda**: colour belongs to the categories and to nothing else. While preparing, the question is how input,
  exercises and exchange are spread over the day, so that is what colour answers. Breaks, gaps and markers are quiet
  rows without a surface.

## Colour

| Token | Light | Dark | For |
| --- | --- | --- | --- |
| `paper` | `#fff8ee` | `#161412` | the ground |
| `surface` | `#ffffff` | `#211e1a` | cards, sidebars, fields |
| `surface-2` | `#f6ecdd` | `#2b2722` | hover, quiet fills |
| `line`, `line-2` | `#eadfce`, `#dccdb6` | `#3a352d`, `#4d463b` | hairlines; field and button edges |
| `ink`, `ink-2`, `ink-3` | `#1e1b18`, `#6b6358`, `#7a7165` | `#f1eadf`, `#aaa295`, `#8d8578` | text, secondary text, hints |
| `brand` | `#12382f` | `#1b4539` | the navigation's ground, the pressed part of a segmented control |
| `brand-ink` | `#12382f` | `#9cc7b4` | titles, times, labels, secondary buttons |
| `accent` | `#c94a0c` | `#c94a0c` | the main action, the insert marks, the target while dragging |
| `accent-soft` | `#fce6d2` | `#4a2c1a` | selection |
| `accent-strong` | `#a4441a` | `#f08a4b` | the action colour as text (the fill itself is too light for small text) |
| `amber` | `#8f5f14` | `#d3a05a` | needs attention: a stretch without a break that is too long |
| `rose` | `#7c2d54` | `#e8a3bf` | a conflict: overlap, does not fit, over the day's end |
| `--c-*` | the category palette | | the rail of a unit, the day strip, dots in lists |

Colour never stands alone: a category is a rail or dot plus its name, a conflict is the colour plus a sign and a
sentence.

Inside the navigation the text tokens are remapped to the light ones (`.nav-surface`), so anything placed there, also
by a build (`navigation` in `src/start.tsx`), reads without knowing where it stands. What floats out of it (a menu)
hangs on the body and takes the page's colours.

## Type

- Titles (`.app-title`): Bricolage Grotesque, 800, 88 % width, in `brand-ink`. The workshop's title, a page's title, the
  day, the head of a card.
- Everything else: Figtree. Rows 14–15 px, 600 for a unit's title; times 700 in `brand-ink` with tabular figures;
  durations and meta 12–13 px in `ink-2`.
- Field and section labels: 13 px, 600, `brand-ink`, sentence case. No capitals with letter spacing.

## Controls

- Three levels of buttons: filled (`primary`, one per view), with an edge (`default`), without a frame (`ghost`).
- Fields are 38 px high; on coarse pointers controls grow to about 40 px (`pointer-coarse:`), small ones get the
  invisible slop of `.tap`.
- Selection is a fill in `accent-soft`, never a ring. A segmented control shows the chosen part in `brand`.

## The agenda

- **A card is the stretch between two breaks.** Its head names the span and how long it runs without a break, in
  amber when that is over 90 minutes. A gap of 10 minutes or more before a fixed start counts as a break; markers at
  a stretch's edges stay outside the card.
- **A card is surface, not a container.** The day stays one list. Every row draws its own part of the card
  (`.run`, `src/planner/DayColumn.tsx`), so the parts move with their rows while one is dragged, and the cards are
  cut anew after every change. A break put into a card splits it; a break taken away joins two.
- **A unit** is a row: a 6 px rail in its category's colour, the start time, the title, the category's name, the
  length. Its height follows its length and the chosen view (S, M, L), as before.
- **A group** is the app's real container: a title row on the ground's tint, its units indented below, no second
  frame. Folded, its rail shows its members' colours, each as long as the member lasts. A break inside a group does
  not split the card; the head then names the longest stretch.
- **The day strip** above the agenda shows the day to scale in the same colours, with the minutes per category below
  it as word and number. An overlap is drawn in the conflict colour.

## The details of an entry

Opened from the agenda, an entry's details stand in the sidebar; from there they can be shown large.

- **The head says what and when**: the kind as a small menu (it is rarely changed, so it is no row of buttons), the
  span, then the way to the large details, the entry's ⋯ and ×.
- **Text reads as text.** Title and short description have no frame until they are edited (`TextField` with `bare`
  or `wrap`, `src/planner/fields.tsx`); a long title breaks into lines instead of being cut.
- **Short facts are lines**: the name on the left, the value beside it (length, start, category, goal, method, lead).
  A line that says nothing yet is a "+ …" pill below the others, and becomes one again when it is left empty. The
  start is the computed time with "fix" beside it; fixed, it is a field with the way back to the agenda's flow.
- **The category's menu holds the colour.** An own colour instead of the category's is a rare choice: it stands at
  the foot of that menu, not as a row of its own.
- **What an entry carries is a section that folds**: notes, material, files, slides, worksheets, each with how much
  it holds and, folded, a line of what that is. What is folded is remembered on the device for all entries. A section
  without content is its head alone where the head can add to it (material).
- **Large, the same parts stand in two columns** in place of the agenda: what is written on the left (title, goal,
  notes, slides), the facts on the right (time, category, material, files, worksheets). The agenda stays beside it as
  a slim list of the days' entries with their starts, and the head leads to the entry before and after. "To the
  agenda" and Escape make the details small again (Escape leaves a field first); an entry opened anew starts small.
  Back in the agenda, the entry that is open is shown: out of a folded group, on its day, in view. Where the room is
  too narrow for two columns they stand one below the other, and the slim list shows only where both columns fit
  beside it.
- **Large, the head stands in for the workshop's header**, which is out of sight with the agenda: undo and redo,
  the sign of a lost connection, and above the details the notice of a save that failed.
- **Nothing moves under the pointer.** A line left empty (a goal, a material's link) goes only when the press that
  left it is over, so the click lands where it was aimed. One button makes the details large and small, so it keeps
  the focus through both.
- On a phone the details fill the screen anyway: one column, and no large form.

## Inserting

No strip of marks beside the agenda.

- With a pointer that hovers, the ⊕ shows at the card's left edge beside the row under the pointer, and the line
  where the new entry lands when the pointer is on it.
- On touch screens one round button stands at the lower right. It switches inserting on: the rows step back, every
  gap shows as a line with a ⊕, a tap on one asks for the kind (a sheet on phones). At a break there are two gaps,
  the end of the stretch before it and the start of the one after.
- The row of buttons under a day adds at its end, on every device. In an empty day its first button (a unit) is the
  filled one: there it is the main action.

## Without a mouse

- Tab reaches every entry. Enter opens its details, where title, start and length are fields (on a group it folds
  and unfolds it); Space picks the entry
  up and puts it down, the arrow keys move it, Escape cancels. While it moves, a screen reader hears the entry's
  title and the place (the day, the parking lot, the group), not ids.
- The place an entry would land on while it is dragged, by pointer or keys, is outlined in the action's colour.
- An entry's ⋯ menu moves it to the end of another day (the way back from the parking lot, with a place that is
  known beforehand) and to the parking lot.
- On a narrow screen the sidebar keeps the focus like a dialog: the focus goes into it, Tab stays inside, Escape
  leaves a field first and then closes it, and the focus returns to what opened it. The page's shortcuts go on.
- Dialogs and sheets are mounted on the body, so they take the page's colours wherever they were opened.

## The navigation

- **One order, top to bottom**, the same open, folded and in the phone's sheet: the name, where the person is, the
  pages, what manages the place (a build's pages, the settings), who is signed in.
- **One kind of row**: an icon and a label, 14 px, 36 px high, a pill; the open page stands as a cut-out in the
  ground's colour. No rows without an icon and no second size of type.
- The button that folds the navigation is an icon beside the name (below the logo when folded), not a row. Open, the
  navigation is 232 px wide, so that the name and the button fit side by side; a longer name of a build is cut with an
  ellipsis. Folded, it is 60 px.
- **A build adds and moves nothing.** `navigation` (`src/start.tsx`, `components/AppShell.tsx`) has three places:
  `place` under the name (a workspace and the way to the others), `pages` above the settings, `account` at the foot
  (who is signed in). Each is drawn in the form of where it stands: `open`, `folded` or `sheet`. Without them the
  navigation is the name, the pages and the settings.
- What is needed rarely (the other workspaces, signing out, the legal pages) is in the menu of its place, not a row.

## The workshops

- **Time orders the page.** Today divides it: "Next" is the nearest coming workshop as a card of its own (its days as
  a block, how far away it is as a chip in `accent-soft`), "Planned" the others, nearest first, then those without a
  date, then "Past" by year. A year's head is a button in the title face that folds it; it says how many workshops
  and days the year held and, folded, for whom. Only the latest year stands open. Inside a year a small line names
  each month.
- **One kind of line** everywhere (`WorkshopRow`, `src/workshops/parts.tsx`): the days in `brand-ink`, the title, the
  client and place, the length, and for a coming workshop how far away it is. The whole line opens the workshop (the
  title is the link, stretched over the line); the client's name and the actions lie above it. Inside a year the days
  stand without the year, across years with it. On a narrow screen the days move under the title; the length shows
  only where the list is wide enough.
- **The client is a second view, chosen by a switch beside the search** ("By time", "By client"; remembered on the
  device). The clients are a list of one kind of row: name, how many workshops and when next or last, and small bars
  for the workshops per year; the chosen one is a fill in `accent-soft`. Beside it stands that client's history: name
  in the title face, the facts, "New workshop for this client", then what is planned and the years. One slim line
  above still says what stands next. Below `lg` the list and the history are two steps, with "Back".
- **A client's name is a way to go**: in any line it opens that client's history (`?client=`), so the way back is the
  browser's and finds the list where it was left. Not on a phone, where a second thing to press inside a line is
  hit by mistake, and not in a history, where one is there already.
- **The search finds clients first, then workshops.** A client found is a card that opens the history; the workshops
  found are one list across the years, newest first, archived ones with their chip. Escape clears the search and the
  view returns.
- **A line's actions are its ⋯** (duplicate, archive, delete), shown when the pointer is on the line and always on
  touch screens. In a client's history the copy stands beside it as a button of its own: copying an earlier workshop
  is what one comes there for.
- **Selecting is a mode**, as in the library; what stands next is then a line like the others, so it can be ticked.
- The archive and the trash stay at the foot of the page, as buttons that say how much they hold.

## The library

- **The category orders the page.** One section per category in the order of the settings, then the entries without
  one, then the groups. A section's head is the category's dot, its name in the title face, and how many entries it
  holds and how long they run together. A sort (title, length, made, changed) orders the entries inside a section.
- **Filters stand beside the entries where there is room** (from `lg`): the sections, what an entry holds
  (slides, worksheets, files) and the tags. Every option carries the number of entries it would show; one that
  would show none cannot be chosen. A chosen option is a fill in `accent-soft`. On a narrower screen the sections are
  chips under the search field, the chosen one in `brand` as in a segmented control, and the other filters open as a
  sheet from the round button beside the search, with the sort and the theme to look in. The search and the chips
  stay at the top while the page scrolls. The search comes first in the page's order, so Tab reaches it before the
  filters.
- **Two views with two jobs.** Lines to scan: the rail, the title, one line of what the entry is, what it holds as
  signs with numbers, its length. Cards to browse by the picture: the entry's first slide at the top, then the rail,
  the title, the length and the signs. An entry without slides says in the picture's place what it is, so every card
  has the same build.
- **An entry opens as a page of its own** (`/library/:id`), not inside the list. It reads first: what it is about, the
  slides at a size to look at, the worksheets, the notes for the facilitator on the ground's tint; beside them its
  facts (length, category, colour, tags, material, files). An entry that says nothing about itself is its slides:
  they stand first then. Who changes the library gets a pencil per part, which turns it into its fields, and "Done"
  to read it again; the facts are fields at once. In the title's field Enter keeps what was typed and Escape leaves
  the title as it was. A group shows its items in their order, each with all it carries to read.
- **The list and the entry belong together.** The arrows in an entry's head page through the list it was opened
  from, as that list was sorted and filtered, and the count says where in it the entry stands; the focus stays on
  the arrow. The way back is the step back in the browser's history and finds the list as it was left: search,
  filters, place, and the focus on the entry's line. A fresh visit of the library starts fresh. Opened by its
  address alone, an entry pages through its section by title.
- **Selecting is a mode.** "Select" turns the entries into ticks (the whole line or card is the tick); the bar of
  actions comes up as in every list.

## The frame on narrow and wide screens

- Days stand side by side only where the agenda's own room allows it (a container query, not the window's width:
  both sidebars may be open); otherwise they stand one below the other. "Add a day" stands with the day tabs and
  stays in the workshop's menu, where a single day has no tabs.
- The phone's bottom bar has room for five entries. It holds the pages and the settings; where a build adds to the
  navigation, the last entry is "More", a sheet with the rest in the navigation's order: the place, the build's pages
  and the settings, the account.
- A page's header actions wrap onto further lines instead of running off the side. On a phone the slide pool puts
  the upload first, leaves out "Upload folder" (mobile browsers offer no folder to pick) and stands the theme
  choice above the list of decks it changes.
- The print views and their toolbars are always light and carry the light values as fixed colours.
