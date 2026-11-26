# The offline copy

A fallback for when the connection breaks or there is none (a venue without Wi-Fi, a train): the device shows the
workshops of the coming weeks read-only, with the agenda, the moderation plan and presenting with the presenter view.
Decided on 2026-11-22 (docs/concept.md, section 10). Mainly for the laptop the workshop is run from.

## What the person sees

- **A switch per device** in the settings, "Offline on this device", off by default. Clients' workshops must not stay
  on a shared laptop unasked, so it is switched on where it is wanted, once; after that nothing is to be done.
- **Kept** are the workshops with a day from ten days back to thirty days ahead (one that runs over several days counts
  when any of them is in there) and the last ten opened on this device. Any workshop can also be pinned on the device
  ("Keep on this device", in its ⋯ menu in the planner and in the list), whatever its dates. A workshop stays as long
  as one of its reasons holds (near dates, opened lately, pinned), as Notion keeps its offline pages (`keepReasons`).
  Pins are per device and go with the copy.
- **The settings** list what the copy holds, the soonest first: dates, title, why it is kept and as of when, and for a
  pinned one the way to let go of the pin (as Notion's Offline tab and Google Drive's offline preview).
- **Without the server** the app opens as usual, also after a reload or in a new window, and looks as it always does.
  The list of workshops shows them all: those the copy holds with a small mark (also online, so one can check before
  leaving), the others dimmed and labelled "needs a connection"; opening one of those says why it does not open, and a
  workshop's actions stay in their menu, disabled. Grey alone would read as "disabled", so it always comes with the
  label (as Google Drive, Notion and Spotify do it; the web.dev guidelines). A workshop of the copy opens in the planner as always, with its
  details, slides, worksheets, printing, the presenter view and presenting, but nothing in it can be changed: nothing
  moves, fields take no typing, the slide and sheet editors open to look (`offline/readOnly.ts`). The buttons that add
  or change something stay in place but are disabled and say that they need the connection; the places to insert and
  the handle that changes a length do not show. A bar over every page
  and the workshop's header say that this is the copy and as of when. (A first version showed the guests' read-only
  agenda instead; it looked like another app, and the planner is what one knows.)
- **It answers at once.** Once a request got no answer, the copy answers every request straight away for half a
  minute, and what it does not hold fails straight away, instead of each waiting in turn (a list, a theme, its fonts,
  every picture). The server is still asked beside; its first answer ends this. Meanwhile the app asks every ten
  seconds (with a little jitter) whether the server is back, with a request the worker lets through (`sp-probe`); on an
  answer the worker stops answering from the copy, the bar goes and the list reads again. The first wait for an
  answer is three seconds, as in Workbox's example.
- **The connection breaks while a workshop is open**: what is shown stays (it is newer than the copy) and turns
  read-only. When the live stream is back, the workshop is read from the server again and can be changed.
- **Presenting**: the windows on one device keep in step over the browser's channel (`slides/presentChannel.ts`), as
  they did before when the server was out of reach. Following on a phone needs the server.
- **Read-only, by decision.** Editing offline would mean merging changes made apart; co-editing matters more
  (section 7 of the concept). A change on its way when the connection broke is not kept for later.
- **Turning the switch off deletes the copy**, and so does signing out in a build that has a sign-out and says so
  (`offlineSignOut`, it calls `clearOfflineCopy` first; the settings' hint names it only then). The core alone has no
  sign-out of its own. Someone else signing in at the same app on the device deletes what was kept for the one before.

## How it works

- **A service worker** (`src/offline/sw.ts`, built by `scripts/offlineWorker.ts` into `dist/sw.js` with the list of
  the build's files and a version that changes with them). It is registered only while the switch is on, at the root
  of the host, so one worker serves every app under it; workspaces keep apart by their base path in every address.
  - The build's code, styles and fonts are kept per build (not the CJK font subsets, which come when used). A new
    build installs itself and drops the files of the one before.
  - The app's page is kept as the server last sent it, with its security policy; only a page that is the app's
    (`isAppPage`), not one of a login or workspace choice in front of it. It stands in only for a page of an app whose
    workshops are kept (`isAppRoute`): never for an address of the API (a file, an export, a download), the agents'
    endpoint and its sign-in, or anything in front of the app; those go to the server as before.
  - The API answers the copy holds (`src/offline/policy.ts`): who is signed in, the settings and their logo, the list
    of workshops, the themes with their stylesheets, files and pools, and per kept workshop the workshop and its
    pictures. Nothing else: not the library, decks, members, exports or the live stream. These go to the server first;
    what comes back is kept with the time it came. With no answer (no network, a gateway error, or no first answer
    within four seconds, or straight away while the server counts as gone) the kept one answers, marked with the header `x-sp-offline` and that time. The time counts to
    the server's first answer, not to the end of the download: storing happens beside, so a slow line that answers is
    not taken for none.
  - Everything that changes data goes to the server as before; the worker never answers it.
- **The keeper** (`src/offline/client.ts`) runs in the page while the switch is on: on start, every fifteen minutes and
  when the network returns it reads the list, decides what is kept (`pickKept`), fetches each kept workshop with its
  theme, the pictures of its slides and worksheets and the theme pool's pictures (for the generated slides), and lets
  go of workshops no longer kept. The open workshop is read again a few seconds after changes rest, so the copy follows
  the work. Its reads go beside the API client, so a background answer from the copy never puts up the bar. Switching
  off stops a round on its way (a generation count) before it writes anything more.
- **The app** learns from the header that an answer came from the copy (`src/api.ts`, `offline/state.ts`). The open
  workshop then carries `offlineAt` (`store/usePlanner.ts`); changes, undo and redo are refused while it does. Once a
  workshop is shown, an answer from the copy never replaces it (it is never older than the copy). When the copy answered
  while the live stream is up, the server was only slow: the workshop is read again after five seconds. The list
  knows what the copy holds from `keptHere` and hears `sp:offline-kept` when that changes.

## Privacy

The copy holds workshop content (including facilitation notes) in the browser's storage of the device, nowhere else,
and only where someone switched it on. It is deleted by the switch, by signing out, and for a different person
signing in. A device that is lost or shared while it holds a copy holds that content; the hint beside the switch says
to switch it on only on one's own device.

Fixed 2026-11-26: a picture chosen by hand for a generated slide (the title slide's, an agenda's, a break's) is kept on the workshop as a bare hash, not as an `asset:` reference in markup, and was missing from the copy: the presentation started offline without it. The copy now takes every picture a workshop shows (`workshopPictures`, `src/offline/policy.ts`).
