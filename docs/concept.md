# Session Planner – Concept (draft 5, 2026-11-05)

Plan the agenda of a workshop by moving its steps around until the time works, keep the facilitator's notes, material and files with each step, and share the plan with co-facilitators and clients. A third app next to Zendo and the Revenue Tracker, on the same server (`sessions.` subdomain), built the same way as Zendo.

Decisions are in section 10; the stages are in section 9.

## 1. Purpose

- One place per workshop: the agenda with times, what happens in each step and why, who leads it, what is needed, and what to keep in mind while facilitating.
- Planning is hands-on: steps are dragged into place, stretched and shrunk, parked and brought back; the times follow at once, and the app shows where the plan does not fit.
- Several people can work on the same plan at the same time and see each other's changes (your own devices and windows, and invited guests).
- Later: run the workshop against the clock on a laptop or phone (live mode).

## 2. Core concepts

| Concept | Fields | Notes |
|---|---|---|
| **Workshop** | title, client, location, goal, notes, time zone (Europe/Berlin), archived | Has one or more days and one parking lot. |
| **Day** | date, start time, target end time (optional) | Ordered by position. Times are minutes after midnight in the workshop's time zone. |
| **Agenda item** | kind, title, short description, duration, fixed start (optional), goal, method, lead, notes, material, attachments | In a day (ordered) or in the parking lot. Start and end are *computed*, never typed (section 4). |
| **Material** | list on an item (or on the workshop as a whole): label, quantity, optional link | Rolls up into the workshop's packing list (section 5). |
| **Group** | title | A heading over consecutive items of a day or the parking lot. Groups and ungrouped items share the day's order; members have their own order inside the group. |
| **Category** | name, colour | Shared by all workshops (settings); an item has one, and may override its colour. |
| **Library entry** | an item's content, or a group with its items, with their files | Shared by all workshops; inserting makes a copy, of the files too. |
| **Attachment** | a file of the workshop (slides, handout, worksheet) | Belongs to the workshop; linked to any number of items. A library entry holds files of its own, per item. |

Item **kinds**:

| Kind | Duration | Shown as |
|---|---|---|
| Block | ≥ 5 min | a card as tall as it is long |
| Break | ≥ 5 min | a quieter card |
| Marker | 0 | a thin line with time and title ("Participants arrive", "Photo", "End") |
| Note | 0 | a short text in the flow of the agenda (a reminder, pre-work, a cue for the co-facilitator) |

Goal, method and lead make the printed plan look like a German facilitation plan (Zeit · Inhalt · Ziel · Methode · Wer · Material).

## 3. Interactive planning

The agenda is a vertical timeline per day, each item as high as it is long; several days stand side by side; on a phone they stack. The parking lot, library, packing list, files and details share a foldable sidebar on the right (full screen on a phone).

- **Drag to reorder** within a day, **between days**, and **to and from the parking lot**. While dragging, all times recompute live, so you see the effect before you drop.
- **Drag the lower edge to change the duration**, snapping to 5 minutes (with a mouse; on touch screens a tap on the length opens the time editor, section 10). From the keyboard: select an item, then `+`/`−` changes it by 5 minutes.
- **Fixed start** on any item: lunch at 12:30, the board member at 15:00. The free items around it flow; gaps and overlaps show at once.
- **Insert**: add a block, break, marker or note at the end of a day or in the parking lot, then drag it into place. **Duplicate** an item.
- **Undo/redo** (`Ctrl+Z`, `Ctrl+Shift+Z`/`Ctrl+Y`) for every change made in this window: moves, resizes, edits, deletes.
- Changes made in another window or on another device appear live.

## 4. Time rules

Computing a day (pure function, `src/domain/time.ts`):

1. Items in list order; the cursor starts at the day's start.
2. An item without a fixed start begins at the cursor. An item with a fixed start begins at that time: if the cursor is earlier, the difference is a **gap**; if the cursor is later, the difference is an **overlap** (the items before run into it). A fixed start is hard: the item stays at its time, the problem is shown, never solved silently.
3. The cursor moves to the item's end. Markers and notes take no time.
4. Fixed starts out of order (a 12:30 item below a 15:00 item) need no extra rule: they show as an overlap.
5. **Segments**: the day is cut by its fixed starts into stretches (start → lunch → board member → target end). Each shows *available* and *planned* minutes; an item that ends after the next fixed start or the target end is marked as not fitting.
6. **Day totals**: computed end against the target end, working time, break time, and the longest stretch without a break (warning above 90 minutes).
7. Parked items take no time. Moving an item to the parking lot keeps its fixed start for when it comes back.

## 5. Material and attachments

- Material entries on an item: label, quantity, optional link.
- **Packing list** of the workshop: entries grouped by label (case and spaces ignored). The quantity is the *largest* quantity of any single item, not the sum, because two steps with two flipcharts each need two flipcharts. The quantity can be overridden (e.g. cards are used up), each line can be ticked off, and marked "at the venue".
- **Attachments**: PDF, pictures, Word, Excel, PowerPoint and Markdown files (with their open counterparts, plain text and CSV; no macro formats), up to 5 MB each and 500 MB per workshop. The server checks both, by the file's ending; files uploaded before these limits stay as they are. They are uploaded to the workshop or to a step, and every file of the workshop shows in its list of files with the steps that use it, however it arrived. Stored in `data/files/`, delivered only through the API (never as a public path), always as a download (`Content-Disposition: attachment`, `Content-Type: application/octet-stream`, `nosniff`, sandbox CSP), so a file can never run as a page, nor be loaded by one as script or stylesheet.
- **Library files**: a library entry holds files too, each on one of its items (in a group entry on the item they belong to). Files travel as copies, each a file of its own under its own id: inserting an entry gives the workshop copies linked to the new items, saving a step to the library gives the entry copies. A new version in the library, or a file deleted there, leaves existing workshops alone, and the other way round. A new version keeps the file's id, so its links stay.
- **Managing files**, the same in all three places: drop several at once or choose them; what is on its way and what was refused show in the list; per file download, rename (the ending stays), upload a new version, and remove. In a step, removing unlinks; the file stays in the workshop. Guests who may edit can upload and rename; a new version and deleting wipe the old file and are the owner's. Only downloads, no preview in the app.

## 6. Output

Print views (`/w/:id/print/:variant`, browser print, also to PDF), all on A4 portrait with the logo of the workshop's theme (the owner's printout logo from the settings when the theme has none), a running footer (workshop, dates, page x of y) and switches that are remembered per device. Every view has a Markdown twin built from the same switches (copy, or save as `.md`, e.g. for the photo protocol). The field names follow the German facilitation plan (Zeit · Dauer · Inhalt · Ziel · Methode · Wer · Material · Hinweise):

- **Planning overview** (`overview`): one table per day with the columns switched on (time, duration, content with description, goal, method, lead, category, material, files, notes); landscape as an option. The head repeats on every page, a row never splits. For planning and for a co-facilitator who wants everything on a few pages.
- **Moderation plan** (`plan`): built to be worked through during the workshop. Per day first the day at a glance (times, numbered steps, length, lead), then one card per step: the clock time large in the margin with end time and length, a box to tick, the step's number and title, lead and category, description, goal, method, material as a checklist, files, and the facilitation notes in full (Markdown). Breaks hatched with a box, markers as a time line, cue notes shaded, groups as section headings with their time range. Slack before a fixed start and overlaps are printed, so the facilitator sees the buffers. A card never splits across a page. Options: packing list appended, each day on a new page.
- **Client agenda** (`agenda`): clock times, titles, short descriptions and the workshop's goal; groups as sections, breaks and markers quiet; no methods, notes, slack or warnings. Goal per step, lead and durations can be switched on. Days follow each other (one page for most workshops); a page per day as an option.
- **Packing list** (`packing`): a box per line, quantity, which steps need it, link, "at the venue".

## 7. Working together

- The server is the source of truth. Every change is a small operation (set these fields of this item, create, delete); each window applies its own changes at once and sends them; the server stores them and passes them, as stored, to every open window of the workshop, the sender's included (server-sent events). Each window builds the server's state from that stream in the server's order and shows its own changes still on their way on top of it (`src/domain/sync.ts`).
- Changes are per field, so two people editing different items or different fields never collide. On the same field, the change the server stored last wins, in every window; a field you are typing in is not overwritten by someone else's change while you type, and a field you only visited does not write back what it showed.
- After a lost connection the window reloads the workshop from the server, once the changes it was sending are through. No offline editing in the first stages (co-editing matters more than offline use).
- Undo works on your own changes in this window.

## 8. Access model

**Owner (you).** Signs in with Microsoft 365 through the existing login in front of every app (oauth2-proxy, e-mail allow-list). From stage 1, the app additionally requires the e-mail header set by the login (configurable owner list), so a routing mistake fails closed.

**Guests (co-facilitators, clients).** Guests sign in like the owner: the owner invites them as guests in Entra, puts their e-mail on the login's allow-list and shares single workshops with them in the sidebar (Zugriff). A guest sees only the workshops shared with their e-mail.

| Property | Choices |
|---|---|
| E-mail | as the login reports it, in lower case; one entry per person and workshop |
| Role | **View** · **Edit** (agenda, notes, material, slides, uploading and renaming files; not sharing, replacing or deleting files, the library, themes or templates) |
| Internal notes | hidden · shown, for a view guest; a guest who may edit always sees them |
| Last opened | set when the guest opens the workshop |

How it is enforced:

- One API, `/api/…`, behind the login. The app looks the guest up on every request (table `members`): owner routes refuse guests, and a workshop not shared with them answers as if it did not exist.
- Every route says who may use it, in the route inventory (`server/routes.test.ts`). The test calls each route as every kind of caller and compares the answers with that rule; a route that is not listed fails it.
- A view guest without the notes gets the workshop without facilitation notes and note items. Live updates only tell such a guest that something changed, and the window loads its filtered copy again.
- Removing a guest takes effect at once, also on an open page: their live-update stream ends. Changed access applies from that moment.
- The reverse proxy strips `X-Auth-Request-Email` from incoming requests; the login sets it. With `SP_PROXY_SECRET` the header counts only on requests that carry the proxy's secret (section 11).
- Guests share the owner's origin, so nothing a guest writes may run as code: notes are rendered as text (or sanitised Markdown), a strict Content-Security-Policy, attachments as downloads only (section 5). What a guest may upload and hold open is limited (section 10, 2026-11-01, slides).

On the owner's hosted instance there is no public access, so no share links: every person reaches the app through the Microsoft login, guests included. Draft 4 planned links without an account (a token per link, with a label, password and expiry); they were dropped for this reason, and guest access went in by signed-in e-mail on 2026-10-29. So a guest needs an invitation at the login, and there is no password or expiry per guest. Only machines come past the login, each with its own credentials: agents over `/mcp` and OAuth, and the CRM's link list (section 11).

## 9. Stages and backlog

1. **Planning core** – done (2026-10-29).
2. **Planning comfort** – done (2026-10-29): layout and settings, categories and colours, editing title, time and duration on the card (any common way of writing a length or time), description switch, groups, library, packing-list additions, logo on printouts, duplicating a workshop with moved dates.
3. **Sharing** – done (2026-10-29): guests sign in and see only the workshops shared with them, as view or edit, with or without the notes; section 8.
4. **Claude connector (MCP)** – done (2026-10-29): Claude reads and edits workshops (draft an agenda from a brief, adjust timings, group and park items, fill the packing list, use the library), over stdio locally and over `/mcp` with OAuth as in Zendo; see [mcp.md](mcp.md).
5. **Import of the owner's sample sessions** into the hosted instance once the feature baseline stands (private material, never in this repository).
6. **Slides** – done (2026-11-01): slides as text in a small HTML subset on items and in the library, a slide pool of translated decks, themes as data, a deck per workshop with generated title, agenda and break slides, presenting from the app, a standalone HTML file and 16:9 print; see [slides.md](slides.md).
7. **Slide editor** – done (2026-11-01): slides edited as content fields next to the live slide, the layout chosen from the catalogue and carrying the content along, themes (colours, fonts, logo) made and edited in the app with contrast checks, template slides as named starting points; see [slides.md](slides.md), section 7.
8. **Preparing for several workspaces** – in preparation: section 10, 2026-11-05. No change for users.

**Backlog** (no order):

- Moving several selected items at once, and shortening them by a percentage.
- Day variants: a snapshot before a rework, and going back to it.
- Minimum duration and "optional" per item, with fit suggestions for a stretch that is over.
- Asking before saving the same item to the library twice.
- Live mode on laptop or phone (section 4.2 of draft 2): now line, countdown, ahead/behind, re-forecast, planned against actual. Rarely needed so far. The presentation view is its seed; a break slide could show the re-forecast end.
- Slides: moving a slide between items; updating placed copies from the library; themes and templates through the connector.
- Breakout groups in parallel; real durations from past workshops in the library; a balance view of the categories; link to the CRM project.
- Logos named by their ground instead of by place: "on a light ground" and "on a dark ground" for each theme, chosen by the app by the brightness of what they stand on (slide background, field, white paper), so a dark partner theme can bring its colour logo for the printouts. Existing logos would move by the brightness of their theme's background. Wait for the first dark partner theme.
- Print: a "cut if short on time" / plan B field per step and a per-step timing of the notes, as facilitator guides recommend; a Markdown export through MCP for agents.

## 10. Decisions

**2026-11-05, several workspaces later**

- The core should be able to serve several separate workspaces later. A workspace holds everything that belongs together: workshops, library, decks, themes, templates, settings and files. Nothing of one workspace is reachable from another, through any route, export, live update or agent connection.
- Local use and today's hosted instance go on as they are, without choosing a workspace and without moving any data. Several workspaces are for a separate second instance, for invited partners. Nothing is built yet, and users see no change.
- Login and accounts stay outside the core, behind a small interface, so the core depends on no provider.
- Guests of a workshop (section 8) stay a thing of their own, apart from belonging to a workspace. Two roles in a workspace: the owner, who alone invites, and members, who see and edit everything in it.
- One database and files folder per workspace, plus a small central database for people and memberships: nothing of one workspace can be reached by a wrong query in another, and today's queries stay as they are. A new workspace gets copies of a starter pack, nothing shared.
- This holds only while nothing is shared live between workspaces, workshops never move between them and one server runs the app. A feature that breaks one of these reopens the decision.
- An instance can switch on a read-only agenda page per workshop, reachable without signing in: the client agenda and nothing else, revocable, created by owners and members. Off by default, and the owner's hosted instance stays without it.

**2026-11-04, branding per workshop** (revises "only the owner's logo on the printouts" of 2026-10-29)

- A workshop's theme is its branding, called "Branding (theme)" wherever it is chosen: in the workshop's details, in its Slides tab and, for new workshops, in the settings; "Default" there names the theme it stands for. It drives the slides and the printouts alike, and stays with the owner (guests with edit rights may not change it, like archiving).
- The printouts show the theme's logo for paper: the uploaded logo of a light theme, or `logo.svg`/`.png`/`.webp`/`.jpg` beside a folder theme's theme.css. A dark theme's logo is made for its dark ground and would vanish on white paper, so a dark theme has none for paper. Without one, the owner's printout logo from the settings stands there. The theme list (`GET /api/themes`) carries each theme's `printLogo`, so guests' printouts show it too.
- Each print view says where its logo comes from (the branding, or the settings and why) and has a switch "Logo", remembered like the others, for a neutral printout without changing the branding. The theme editor says that the logo heads the printouts, and that a dark theme's does not; its logo preview stands on the theme's own ground.
- The printouts stay black on white: the theme gives them its logo, not its colours or fonts, so the rules of section 6 (no colour that carries meaning, readable on any printer) still hold.
- Counter-argument considered: a client agenda for a workshop in a partner's theme now carries the partner's logo instead of the owner's. Wanted, since agenda and slides should look like one set; a workshop that should carry the owner's logo uses a theme without a logo, or the owner's theme.

**2026-11-02, presenting together** (revises "presentation windows load the deck once" from the same day)

- The server keeps the slide each workshop's presentation shows (in memory, forgotten after six hours without paging). Every window of the presentation pages it and follows it over the live stream: the full-screen presentation, the presenter view, a phone as remote. A window opened later joins at that slide, so closing and reopening one no longer drifts. Its own paging wins over news from before it (the server's order decides); without the server, the windows of one browser still page together over a broadcast channel and tell the server where they stand once it is back. Owner and edit guests lead; view guests are not told.
- The presentation and the presenter view run on the planner's live store: a slide changed anywhere shows at once. The presenter view edits the slide shown, the next one or any other through the planner's slide editor on the deck; paging in the editor leaves the audience where it is, "Present from here" there moves it.
- On a phone the presenter view is a remote: large buttons at the thumb, a swipe on the slide, the screen kept on.

**2026-11-02, slides are looked at first**

- A slide opens to look at it: large, without fields, paging by arrows, swipe or thumbnails. Editing is one step away (Edit, E, a double-click on a text, which opens its field); Done or Escape goes back. A slide just added and "Edit slides" open straight into editing; read-only slides stay in the viewer with their note. Undo works in both. "Present from here" in the planner opens the presentation at the slide shown.
- Counter-argument considered: one more click for every change. Accepted because viewing is the common case, and the double-click on a text goes straight to its field.

**2026-11-02, slides throughout the app**

- One way to open a slide: a thumbnail outside a picker opens that slide in the editor, from a step, the slide count on an agenda card, the deck tab, the library, the templates and the pool; the editor pages within what it was opened from and says so in its header. Generated slides in the deck are shown with what they are made of and what can be done instead (details, hide, a slide of its own for a break); pool slides are read-only with "Save as template". Pickers keep selecting.
- The editor has its own history: every change a step (typing in one field one step), Ctrl+Z inside the fields too, buttons in the header; a step changed elsewhere since is dropped, not forced. In the planner the whole editing session is one undo step.
- Dialogs, sheets, menus and the editor take the focus, keep Tab inside and give it back to their opener.
- The pool, the templates and the themes form one navigation entry, Slides, with tabs; a workshop's theme is chosen in its Slides tab; "Manage themes" and "Manage templates" sit wherever a theme or a template is chosen. Owner pages send guests to their workshops.
- Accepted: concurrent changes to different slides of one step resolve by the later save.

**2026-11-02, after a review of the whole code**

- Every window applies the server's stream in order, its own changes included, and shows its pending changes on top (section 7). Before, a window skipped its own changes on the stream, so two windows that changed the same field at nearly the same time could end with different values; and a reload after a lost connection could undo a change that was still on its way.
- A field saves only what was typed in it: a field merely visited no longer writes back the text it showed over a change from another window.
- Typed lengths: whole minutes, or hours with a decimal ("1,5 h"; "1,5" alone is not a length); blocks and breaks take at least 5 minutes, as every other control already enforced. Clock times also as "9 Uhr" or "9h".
- The presenter view and "today" count in the workshop's time zone, not in UTC or the device's zone.
- The connector takes calls as large as an operation batch (4 MB), so a whole agenda or deck fits in one call; a workshop it creates is checked like the app's and is not left half-made when its details are refused.

**2026-11-01, slide editor** (revises "no slide editor" from the same morning)

- Slides are edited in the app after all, but as content, never as pixels: fields for the words next to the live slide, the layout chosen from the catalogue, the appearance from the theme. Research into slide tools pointed the same way (Beautiful.ai's constraint templates, Gamma's cards, Marp's separation of content and style, the theme/master/layout split of PowerPoint and Google Slides); the catalogue of docs/slides.md is this app's constraint, the editor fills it. The source stays reachable for what the fields do not model, and no slide is locked.
- Themes become data the owner edits in the app: ten colours, two hosted fonts, a few choices and the logo; the rest is derived in OKLab, the stylesheet is generated, the text contrast checked against WCAG 2.2. Theme folders stay for a brand that needs more than tokens. The reason to drop "themes live in the private setup": the owner should set a client's colours in minutes, not deploy a stylesheet.
- Template slides are named slides to start from, shared like the library and copied on insert. They are not masters: the catalogue's layouts are the masters, and the stylesheet owns them.
- No contentEditable on the slide. A click on the slide opens the field it shows, the field lights up its element; plain inputs behave the same on phones and with screen readers.
- Guests with edit rights edit slides too; templates, themes and the pool stay the owner's.

**2026-11-01, slides**

- Slides are text, not pictures: a small HTML subset with a fixed catalogue of layouts, one stylesheet owned by the app, themes as data chosen per workshop. Pictures collapse too much (no search, no agent access, blurry at scale); PowerPoint objects are too much (merging masters, previews need LibreOffice). The way back to PowerPoint is an export (docs/slides.md, section 5a), not a round trip: the PPTX is written from the laid-out slides and never read back.
- Existing decks are translated once, by Claude with the `deck-translate` skill, against the catalogue; the result is reviewed in a static preview before it is uploaded. The translated decks form a slide pool in the app; slides are copied from the pool into items and library entries, so the pool is a source, not a dependency.
- Slides are item content and travel with the library, copies and duplicates; the library's "no files" rule then read "no attachments" (since 2026-11-05 entries hold attachments too, section 5). Pictures are assets stored once by content hash, served through the API with the workshop's access check.
- Nothing a guest writes may run: slides are sanitised on write and on render with an allowlist, SVG included; assets are raster only.
- Nothing a guest does may fill the server: a guest uploads at most 250 MB a day (files and slide pictures together; a picture the server already has costs nothing) and holds at most 10 live-update streams at once (one per window); the files of a workshop take at most 500 MB, the owner's too. The day's count and the streams are kept in memory, so a restart starts afresh (`QUOTAS` in `server/app.ts`).
- The app generates what the plan knows: title, agenda and break slides with the computed times; the facts panel of an exercise can come from the item later.
- Glyphs on section slides need a CJK font; Noto Sans JP, sliced, loaded on demand, inlined into the standalone file when used.
- No slide editor. A source field for small fixes; everything else happens outside, or through the connector later. *(Revised the same day: see "slide editor" above.)*


**2026-10-30, after trying it on a phone**

- No drag-resize on touch screens. The grip covered the lower half of a short card; the browser's touch adjustment sent taps there to it, so tapping a card rarely opened its details, and a wiggle of a few pixels changed the length. On touch, the length is changed by tapping it (time editor: common values, ±5, slider). Whether to bring direct resizing back on touch in another form is open.
- Workshops list: a search field (title, client, location; every word must match; it includes archived workshops); the client on its own line; the length of the agenda instead of the number of items (per day from its start to its computed end, breaks included, parked items not, summed over the days); the location.
- Library: cards with what an entry holds (kind, category, description, goal, method, lead, material, notes; a group's items with their lengths), two columns on wide screens; the search also looks through descriptions, goal, method, lead and categories, on the library page and in the planner's library tab.

**2026-10-30, print and Markdown**

- A4 portrait for every view; landscape only as an option of the overview table. The first version printed the plan as a landscape table in which each row forced a page of its own.
- Two views for the facilitator instead of one: the overview table for planning (columns of your choice) and the moderation plan as cards for the workshop itself. What the research into facilitation plans agreed on went into the cards: one step per block that never splits across pages, the clock time largest, a box to tick, numbered steps, goal before method, material as a checklist, the notes (Ablauf, cues) in full, a day-at-a-glance list first, the revision date on the sheet, a running footer with title, date and page x of y, and no colour that carries meaning (hatching and shading instead). Sources: the ZIM grid Ziel–Inhalt–Methode with Zeit, Material and Zuständigkeit (SV-Bildungswerk, Methode des Monats, 2010), the Bertelsmann Stiftung handout "Der Moderationsplan" (2018: Schritt · Ziel · Methodik · Hilfsmittel · Zeit), the Berufsgenossenschaften's Moderationsleitfäden (Dauer · Inhalt/Material · Hinweise für Moderierende), SessionLab's split of description (for everyone) and additional information (facilitators only), and the checklist rules of Gawande and Boorman (2010) and Degani and Wiener (NASA, 1990).
- The client agenda stays lean by default (times, titles, descriptions, goal of the workshop); goal per step, lead and durations are switches. Days follow each other so that most workshops fit one page.
- The Markdown twin is built from the same rows and switches as the printed page (`src/domain/print.ts`), so the file always matches the paper. Tables for the overview and the agenda, a section per step for the moderation plan, a task list for the packing list. No new fields in the data model: the notes hold the Ablauf and the cues.
- Switches are remembered per device and per view (localStorage), not per workshop.

**2026-10-29, MCP**

- The agent acts as the owner (every workshop, notes included); files, sharing and deleting workshops stay in the app. No read-only scopes for now.
- Guests (co-facilitators, clients) never get MCP access: only owners (`SP_OWNERS`) can approve a connection or manage agents; there is no guest-scoped token.
- Tools take ids or titles (days also dates or numbers) and answer with computed times and warnings, so the agent can judge whether the day still works without reading the whole workshop again.
- Every write is a batch of the app's own operations: the same validation, the same transaction, and the open windows see it live through the hub. The stdio server is a separate process and has no hub: there the page is reloaded.
- OAuth is a copy of Zendo's (`server/oauth.ts`): same flow, same token lifecycle; approval is tied to the owner list (`SP_OWNERS`) instead of a separate allow-list.

**2026-10-29, phones**

The same app, not a reduced one; what differs follows the device, consistently:

- A tap on a card opens its details (no inline title editing on phones: there is no hover to tell the two apart; group headings are still renamed in place); start time and length still open their editor right from the card. Dragging is press-and-hold; the hint under the agenda says so instead of the keyboard shortcuts.
- Secondary choices come up as bottom sheets with labelled rows: the ⋯ menus, the ⊕ between entries (instead of the radial menu) and the time editor. A tap on the backdrop closes a sheet; for the time editor that saves, like a click elsewhere on desktop.
- The planner header keeps back, title, undo and the sidebar; the rest (redo, descriptions, zoom, add day, print) sits in a ⋯ menu. The day heading uses the short date and drops the focus button (the day tabs do that).
- Details opened from the agenda go back to the agenda; details opened from a sidebar tab go back to that tab.
- Touch targets: on coarse pointers icon buttons, segmented controls, colour dots, the ⊕ and the resize grip are larger, and small controls get an invisible 6px slop (`.tap`), so nothing drops below about 40px without moving the layout. The resize grip blocks page scrolling while it is dragged.
- Safe areas (notch, home indicator) on the shell, the full-screen sidebar, sheets and dialogs; overlays contain their scrolling. The offline state is shown as text next to the dot, on every size.

**2026-10-29, third round**

- Duplicating a workshop belongs to the current scope; the other planning-comfort ideas and live mode go to the backlog.
- Time and duration of every entry are typed directly, in any common form (90, 1:30, 1h30, 1,5 h).
- Sharing next, then the Claude connector.

**2026-10-29, after trying stage 1**

- Layout like Zendo and the Revenue Tracker: navigation on the left (foldable), settings page (language, categories, logo, default day times). Most workshops are one day, some two: one day gets a single wide, centred column, two share the width, more scroll sideways.
- The parking lot (*Themenspeicher*) moves into a foldable sidebar on the right, next to the library, packing list, files and workshop details; item details open there too (as in SessionLab's right sidebar).
- Colour coding by method categories (Input, Übung, Diskussion, Reflexion, Energizer, Organisatorisches – editable), per item overridable, and subtle: a thin bar and the faintest tint.
- Title, start time and duration are edited right on the card; short descriptions can be hidden.
- Groups: a heading over consecutive items (topic or sub-session) with time range and subtotal; collapsible, dragged as a whole; made from a Shift-click selection or by dragging items under a new heading.
- Library shared by all workshops for items and groups; inserting makes a copy (later library edits do not change workshops). Files come along as copies; each workshop keeps its own.
- Material can be added in the packing list, for the workshop in general or for an item.
- Only the owner's logo on the printouts. *(Revised 2026-11-04: see "branding per workshop".)*


**2026-10-29**

- Live mode: laptop or phone, no projector; postponed (stage 4). No separate event log for it.
- Sharing can wait (stage 3); co-editing matters more than offline use, so no offline mode for now.
- Material: packing list *and* attachments.
- UI in German and English, like Zendo. Subdomain `sessions.`.
- Breakout groups only later, if needed.
- Zero-length markers and notes in the agenda.
- Start with a minimal first stage (section 9).

## 11. Architecture

- **Stack** as Zendo: React 19 + Vite + Tailwind 4, Hono on Node 24, SQLite via `node:sqlite` with numbered SQL migrations, TypeScript, Vitest, `@dnd-kit`, i18next.
- **Domain logic** in `src/domain/` without UI or clock (time rules, ordering, packing list, operations), shared by browser and server and tested in isolation.
- **API**: `GET /api/workshops`, `POST /api/workshops`, `GET|DELETE /api/workshops/:id`, `POST /api/workshops/:id/ops` (a batch of operations, applied in one transaction), `GET /api/workshops/:id/events` (server-sent events), attachments under `/api/workshops/:id/attachments` and `/api/attachments/:id`.
- **Order** by a fractional position per day / parking lot; renumbered when two positions get too close.
- **Guard** as in Zendo: changes only with the app's header, from its own host and origin; hosted, the owner's e-mail header must be present and listed (`SP_OWNERS`), and with `SP_PROXY_SECRET` it counts only on requests that carry the login proxy's secret, so reaching the container port past the proxy is not enough to forge it.
- **MCP** (`/mcp`, outside `/api`, only with `SP_MCP_OAUTH=1` or `SP_MCP_TOKEN`): MCP over Streamable HTTP for AI agents, authenticated with `Authorization: Bearer` (an OAuth access token or the static token). `server/oauth.ts` serves the OAuth discovery and `/oauth/*` endpoints (clients and token hashes in `oauth_clients` / `oauth_tokens`, migration 0004); `GET/DELETE /api/mcp/connections` and `POST /api/mcp/arm` (owner only) back Settings → AI agents; hosted, a new connection can be approved only within 10 minutes after **Connect an agent** there, once, so a consent link someone else sends cannot connect their agent. The tools (`server/mcp.ts`) wrap `server/ops.ts`, which turns an agent's request into a batch of operations, validates it like the browser's, applies it through `Repo.applyOps` and publishes it on the hub. The same tools run over stdio (`npm run mcp`). See [mcp.md](mcp.md).
- **Link list** (`GET /api/link/workshops`, only with `SP_LINK_TOKEN`): the CRM links its deliveries to workshops. It authenticates with `Authorization: Bearer` and its own token, outside the login's guard, and gets id, title, client, first and last date and the archived flag of all workshops – no agendas, notes, people or files, and nothing it could change. Hosted, it is meant to be reachable only inside the server (the reverse proxy serves it on an internal port and refuses it on the public address); the token is a second line, not the only one. The CRM keeps the workshop id and title on the delivery and links to `/w/:id`, which opens behind the login as usual.
- **One container**, data in `/data` (`sessions.db`, `files/`, daily copies in `backups/`).
- **Server setup** in a private setup repository, never here (reverse-proxy block, compose file, redirect URI of the login, deploy entry).
- **Privacy**: this repository is public. Workshop data, files and `.env` stay in the gitignored `data/` folder; a pre-commit guard as in Zendo.
