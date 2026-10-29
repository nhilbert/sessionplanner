# Session Planner – Concept (draft 3, 2026-10-29)

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
| **Material** | list on an item: label, quantity, optional link | Rolls up into the workshop's packing list (section 5). |
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

The agenda is a vertical timeline per day, each item as high as it is long; several days stand side by side, the parking lot next to them; on a phone they stack.

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

Print views (browser print, also to PDF):

- **Facilitation plan**: A4 landscape table per day – time, duration, content and description, goal, method, lead, material, notes.
- **Client agenda**: times, titles and short descriptions only.
- **Packing list** with checkboxes.

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

## 9. Stages

1. **Planning core (minimal)** – workshops (create, edit, archive, delete); days; items of all four kinds with goal, method, lead, notes, material; timeline with drag within and between days and to the parking lot, resize, `+`/`−`; fixed starts, gaps, overlaps, segments and day totals; undo/redo; live updates between windows; packing list; attachments; the three print views; German and English. Owner only, behind the login.
2. **Planning comfort** – phases (group items, subtotals, collapse, drag as a whole); multi-select (move, shorten by a percentage); day variants (snapshot before a rework, go back); duplicate a workshop with shifted dates; minimum duration and "optional" per item with fit suggestions for a stretch that is over.
3. **Sharing** – section 8.
4. **Live mode** on laptop or phone (no projector): now line, the running item with countdown and notes, next item, buffer to the next fixed start, +5/−5 minutes, skip, re-forecast of the rest of the day, screen kept awake; afterwards planned against actual time and a reflection note.
5. **Later, if needed** – breakout groups in parallel; templates and a method library with real durations; categories and a balance view; a Claude connector (MCP) as in Zendo and the CRM; link to the CRM project; Markdown export (e.g. for the photo protocol).

## 10. Decisions

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
- **One container**, data in `/data` (`sessions.db`, `files/`, daily `VACUUM INTO` copies in `backups/`).
- **Server setup** in a private setup repository, never here (reverse-proxy block, compose file, redirect URI of the login, deploy entry).
- **Privacy**: this repository is public. Workshop data, files and `.env` stay in the gitignored `data/` folder; a pre-commit guard as in Zendo.
