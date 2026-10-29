# Session Planner

Plan workshop agendas by moving the steps around until the time works. A companion to [Zendo](https://github.com/nhilbert/zendoapp), built the same way and hosted the same way.

- **Timeline per day**, each step as tall as it is long. Drag steps to reorder them, move them between days or into the parking lot (*Themenspeicher*); drag the lower edge (or press `+`/`−`) to change the length. Times follow live while you drag.
- **Fixed start times** (lunch at 12:30): the rest flows around them. Gaps, overlaps and steps that no longer fit before the next fixed time or the target end are shown at once, with available against planned minutes per stretch and a warning for long stretches without a break.
- **Four kinds of items**: block, break, marker (zero length, e.g. "Participants arrive") and note (a cue in the flow of the agenda).
- **Edit on the card**: click the title, start time or length to change it right there; short descriptions can be hidden.
- **Groups**: a heading over several steps (a topic or sub-session) with time range and subtotal, collapsible, moved as a whole.
- **Categories** (Input, Exercise, Discussion …) with quiet colours, editable in the settings, overridable per step.
- **Library** shared by all workshops: save a step or a group, drag it into any agenda as a copy.
- Per step: short description, goal, method, lead, notes, material and files.
- **Packing list** from all material (largest quantity of any single step, not the sum), tick off, mark "at the venue", override quantities, add material right there.
- **Files** (up to 25 MB) attached to the workshop and linked to steps.
- **Print views** with your logo: facilitation plan (A4 landscape), client agenda, packing list.
- **Live updates** between open windows and devices; undo/redo (`Ctrl+Z`, `Ctrl+Shift+Z`).
- German and English, light and dark.
- **On a phone**: days stack, the sidebar fills the screen, menus and the time editor come up as bottom sheets, a tap opens an item, press and hold drags it.

The concept, decisions and the next stages (planning comfort, sharing by link, live mode) are in [docs/concept.md](docs/concept.md).

## Run it

```bash
npm install
npm run hooks:install   # pre-commit guard against committing private files
npm run dev             # UI on http://127.0.0.1:5177 + server on 5175
npm run build && npm start   # one process serving everything on http://127.0.0.1:5175
```

`npm test` runs the domain and server tests, `npm run typecheck` the type check.

Data lives in `data/sessions.db` (SQLite) with attachments in `data/files/` and a daily copy in `data/backups/`. Hosted, the same container runs behind a login proxy; see `.env.example` and `Dockerfile`.

## Privacy

This repository is public. My own name and contact details may appear here; nothing else personal does:

- Workshop data, uploaded files and `.env` stay in the gitignored `data/` folder (`sessions.db`, `files/`, `backups/`).
- Sample and test data are fictional (`example.com` addresses, invented companies and names). Screenshots only from sample data.
- Server addresses, host names and the hosting setup live in a separate private repository.

A guard enforces this on every commit and push (`.githooks/guard.sh`, enabled by `npm run hooks:install`). It refuses private files, keys, public IP addresses, e-mail addresses other than your own (`git config user.email`) and example/noreply ones, and anything listed in `.git/info/private-patterns`. That file lives inside `.git`, so it is never committed or pushed; create it once per clone, one extended regex per line, e.g. your server's address and host names, client names:

```
# .git/info/private-patterns
203\.0\.113\.7
[a-z0-9-]+\.example\.com
Example Client GmbH
```

Without it, commits only warn and pushes are refused.

## Licence

MIT – see [LICENSE](LICENSE).
