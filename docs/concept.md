# Session Planner – Concept (draft 4, 2026-10-29)

Plan the agenda of a workshop by moving its steps around until the time works, keep the facilitator's notes, material and files with each step, and later share the plan with co-facilitators and clients by link. A third app next to Zendo and the Revenue Tracker, on the same server (`sessions.` subdomain), built the same way as Zendo.

Decisions of 2026-10-29 are in section 10; the stages are in section 9.

## 1. Purpose

- One place per workshop: the agenda with times, what happens in each step and why, who leads it, what is needed, and what to keep in mind while facilitating.
- Planning is hands-on: steps are dragged into place, stretched and shrunk, parked and brought back; the times follow at once, and the app shows where the plan does not fit.
- Several people can work on the same plan at the same time and see each other's changes (first your own devices and windows, later guests with a link).
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
| **Library entry** | an item's content, or a group with its items | Shared by all workshops; inserting makes a copy. No files. |
| **Attachment** | a file of the workshop (slides, handout, worksheet) | Belongs to the workshop; linked to any number of items. |

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
- **Drag the lower edge to change the duration**, snapping to 5 minutes. From the keyboard: select an item, then `+`/`−` changes it by 5 minutes.
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
- **Attachments**: upload files to the workshop (up to 25 MB each), link them to items, download them. Stored in `data/files/`, delivered only through the API (never as a public path), always as a download (`Content-Disposition: attachment`, `nosniff`, sandbox CSP), so a file can never run as a page.

## 6. Output

Print views (`/w/:id/print/:variant`, browser print, also to PDF), all on A4 portrait with the owner's logo, a running footer (workshop, dates, page x of y) and switches that are remembered per device. Every view has a Markdown twin built from the same switches (copy, or save as `.md`, e.g. for the photo protocol). The field names follow the German facilitation plan (Zeit · Dauer · Inhalt · Ziel · Methode · Wer · Material · Hinweise):

- **Planning overview** (`overview`): one table per day with the columns switched on (time, duration, content with description, goal, method, lead, category, material, files, notes); landscape as an option. The head repeats on every page, a row never splits. For planning and for a co-facilitator who wants everything on a few pages.
- **Moderation plan** (`plan`): built to be worked through during the workshop. Per day first the day at a glance (times, numbered steps, length, lead), then one card per step: the clock time large in the margin with end time and length, a box to tick, the step's number and title, lead and category, description, goal, method, material as a checklist, files, and the facilitation notes in full (Markdown). Breaks hatched with a box, markers as a time line, cue notes shaded, groups as section headings with their time range. Slack before a fixed start and overlaps are printed, so the facilitator sees the buffers. A card never splits across a page. Options: packing list appended, each day on a new page.
- **Client agenda** (`agenda`): clock times, titles, short descriptions and the workshop's goal; groups as sections, breaks and markers quiet; no methods, notes, slack or warnings. Goal per step, lead and durations can be switched on. Days follow each other (one page for most workshops); a page per day as an option.
- **Packing list** (`packing`): a box per line, quantity, which steps need it, link, "at the venue".

## 7. Working together

- The server is the source of truth. Every change is a small operation (set these fields of this item, create, delete); each window applies its own changes at once and sends them; the server stores them and passes them to every other open window of the workshop (server-sent events).
- Changes are per field, so two people editing different items or different fields never collide. On the same field, the later change wins; a field you are typing in is not overwritten by someone else's change while you type.
- After a lost connection the window reloads the workshop from the server. No offline editing in the first stages (co-editing matters more than offline use).
- Undo works on your own changes in this window.

## 8. Access model (stage 3)

**Owner (you).** Signs in with Microsoft 365 through the existing login in front of every app (oauth2-proxy, e-mail allow-list). From stage 1, the app additionally requires the e-mail header set by the login (configurable owner list), so a routing mistake fails closed.

**Guests (co-facilitators, clients).** No account; a **share link** grants access to *one* workshop and nothing else.

| Property | Choices |
|---|---|
| Label | "Anna (co-facilitation)", "Client HR team" – shown to you and wherever the guest's changes appear |
| Role | **View** · **Edit** (agenda, notes, material, not the links) |
| Internal notes | hidden (default for view) · shown (default for edit) |
| Password | none · set (scrypt hash; changing it signs out everyone who used the old one) |
| Expiry | none · date (end of that day in the workshop's time zone) |
| Status | active · revoked; "last opened" |

How it is enforced:

- Link `https://<host>/s/<token>`, random 256-bit token; the database keeps only its SHA-256.
- Two API surfaces: owner API `/api/…` behind the login; guest API `/api/s/<token>/…`, public at the edge, where the app checks token, password cookie, role, expiry and revocation on every request. No guest route takes a workshop id.
- Caddy: the `sessions.` block strips `X-Auth-Request-Email` from incoming requests; `/s/*`, `/api/s/*` and the hashed build files under `/assets/*` bypass the login.
- Password: answered with a signed, HttpOnly, Secure cookie per link (`__Host-` prefix, link id in the name), rate-limited per link and per client address (from `X-Forwarded-For`, trusting Caddy only).
- Guests share the owner's origin, so nothing a guest writes may run as code: notes are rendered as text (or sanitised Markdown), a strict Content-Security-Policy, attachments as downloads only (section 5).
- Guest pages: `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`, `Cache-Control: no-store`; URLs are never logged by the app. Revoking or expiring a link closes its open live-update streams.

Heavier alternatives (guest accounts in Entra, own user accounts) are not worth it for a handful of guests; an e-mail magic link can be added later without changing the model.

## 9. Stages and backlog

1. **Planning core** – done (2026-10-29).
2. **Planning comfort** – done (2026-10-29): layout and settings, categories and colours, editing title, time and duration on the card (any common way of writing a length or time), description switch, groups, library, packing-list additions, logo on printouts, duplicating a workshop with moved dates.
3. **Sharing** – in progress: section 8.
4. **Claude connector (MCP)** – done (2026-10-29): Claude reads and edits workshops (draft an agenda from a brief, adjust timings, group and park items, fill the packing list, use the library), over stdio locally and over `/mcp` with OAuth as in Zendo; see [mcp.md](mcp.md).
5. **Import of the owner's sample sessions** into the hosted instance once the feature baseline stands (private material, never in this repository).

**Backlog** (no order):

- Moving several selected items at once, and shortening them by a percentage.
- Day variants: a snapshot before a rework, and going back to it.
- Minimum duration and "optional" per item, with fit suggestions for a stretch that is over.
- Asking before saving the same item to the library twice.
- Live mode on laptop or phone (section 4.2 of draft 2): now line, countdown, ahead/behind, re-forecast, planned against actual. Rarely needed so far.
- Breakout groups in parallel; real durations from past workshops in the library; a balance view of the categories; link to the CRM project.
- Print: a "cut if short on time" / plan B field per step and a per-step timing of the notes, as facilitator guides recommend; a Markdown export through MCP for agents.

## 10. Decisions

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
- Library shared by all workshops for items and groups; inserting makes a copy (later library edits do not change workshops). Files stay with each workshop.
- Material can be added in the packing list, for the workshop in general or for an item.
- Only the owner's logo on the printouts.


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
- **Guard** as in Zendo: changes only with the app's header, from its own host and origin; hosted, the owner's e-mail header must be present and listed (`SP_OWNERS`).
- **MCP** (`/mcp`, outside `/api`, only with `SP_MCP_OAUTH=1` or `SP_MCP_TOKEN`): MCP over Streamable HTTP for AI agents, authenticated with `Authorization: Bearer` (an OAuth access token or the static token). `server/oauth.ts` serves the OAuth discovery and `/oauth/*` endpoints (clients and token hashes in `oauth_clients` / `oauth_tokens`, migration 0004); `GET/DELETE /api/mcp/connections` (owner only) backs Settings → AI agents. The tools (`server/mcp.ts`) wrap `server/ops.ts`, which turns an agent's request into a batch of operations, validates it like the browser's, applies it through `Repo.applyOps` and publishes it on the hub. The same tools run over stdio (`npm run mcp`). See [mcp.md](mcp.md).
- **Link list** (`GET /api/link/workshops`, only with `SP_LINK_TOKEN`): the CRM links its deliveries to workshops. It authenticates with `Authorization: Bearer` and its own token, outside the login's guard, and gets id, title, client, first and last date and the archived flag of all workshops – no agendas, notes, people or files, and nothing it could change. Hosted, it is meant to be reachable only inside the server (the reverse proxy serves it on an internal port and refuses it on the public address); the token is a second line, not the only one. The CRM keeps the workshop id and title on the delivery and links to `/w/:id`, which opens behind the login as usual.
- **One container**, data in `/data` (`sessions.db`, `files/`, daily `VACUUM INTO` copies in `backups/`).
- **Server setup** in a private setup repository, never here (reverse-proxy block, compose file, redirect URI of the login, deploy entry).
- **Privacy**: this repository is public. Workshop data, files and `.env` stay in the gitignored `data/` folder; a pre-commit guard as in Zendo.
