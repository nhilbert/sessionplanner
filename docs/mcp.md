# Session Planner for AI agents (MCP)

Session Planner includes an [MCP](https://modelcontextprotocol.io) server, built like [Zendo's](https://github.com/nhilbert/zendoapp/blob/main/docs/mcp.md). An agent such as Claude (claude.ai, Desktop, mobile, Claude Code) can work with the same data as the app:

- **read a workshop** with every day's computed times, gaps, overlaps and warnings,
- **draft an agenda** from a brief, or **rework** one: add, change, move, group and park items,
- **keep notes and material** with each step, and maintain the **packing list**,
- **use the library**: save steps and groups, insert copies,
- **work with slides**: read, write, edit and reorder the slides of a step or a library entry as text in the slide format, pick slides from the pool of translated decks, choose the theme, see the deck as it is presented,
- **set up and duplicate workshops**, add and change days.

The tools apply the app's rules: the same validation as the browser, the same time computation, the same packing-list logic. Changes made through the server's `/mcp` endpoint appear in open windows at once (live updates); changes made over stdio appear after a reload.

Example requests:

- "Here is the brief for the team day on 10 November – draft a one-day agenda from 9 to 17 with a lunch break at 12:30."
- "The board member comes at 15:00 for 45 minutes; fit that in and tell me what no longer fits."
- "Shorten the discussion blocks so the day ends by 16:30."
- "Put the check-in and the expectations round under a heading 'Arrival'."
- "What do I need to pack for the strategy workshop? Add two extension cords."
- "Save the feedback round of the team day to the library."
- "Write a statement slide with the leading question for the expectations round and put it in front of the existing slides."
- "On the third slide of the feedback input, the second card is wrong – it should say what we agreed in the notes."

Contents: [Choosing a connection](#choosing-a-connection) · [Connecting](#connecting) · [Hosting behind the login proxy](#hosting-behind-caddy-and-oauth2-proxy) · [Configuration](#configuration) · [Tools](#tool-reference) · [Rules](#rules-the-tools-enforce) · [Security model](#security-model) · [Operations](#operations) · [Troubleshooting](#troubleshooting) · [Limitations](#limitations)

## Choosing a connection

| Situation | Use | Authentication |
|---|---|---|
| Claude on the web, desktop or phone, with the hosted Session Planner | [Connector over OAuth](#claude-as-a-connector-oauth) | Microsoft sign-in at your login proxy, then **Allow** in Session Planner |
| Claude Code or Claude Desktop on the machine that holds `data/sessions.db` | [stdio](#local-process-stdio) | none; whoever can start the process can read the file anyway |
| Claude Code against a Session Planner on `127.0.0.1` | [Local OAuth](#local-oauth-claude-code) | **Allow** in a browser on the same machine |
| Scripts or clients without OAuth | [Static token](#static-token) | `Authorization: Bearer <token>` |

The connector (OAuth) is the recommended way for everything that reaches Session Planner over the network.

## Connecting

### Claude as a connector (OAuth)

Prerequisites: Session Planner is hosted behind Caddy and oauth2-proxy with the owner list (`SP_PUBLIC_URL`, `SP_OWNERS`), and the routes below are in place ([Hosting](#hosting-behind-caddy-and-oauth2-proxy)).

1. In the server's `.env`:

   ```bash
   SP_MCP_OAUTH=1
   ```

   The owners (`SP_OWNERS`, the addresses the login lets in as owners) are the people who may approve connections; guests cannot. Restart the container. The log shows `MCP: https://sessions.example.com/mcp (OAuth)`.
2. In Claude: Settings → Connectors → **Add custom connector**, URL `https://sessions.example.com/mcp`. Leave client ID and secret empty.
3. Claude opens Session Planner's consent page. Sign in with Microsoft if asked, check that it names Claude and `claude.ai` as the destination, press **Allow**.
4. Session Planner → Settings → **AI agents (MCP)** now lists the connection.

Claude Code works against the same URL: `claude mcp add --transport http sessionplanner https://sessions.example.com/mcp`, then `/mcp` in Claude Code to sign in.

### Local process (stdio)

`npm run mcp` speaks MCP on stdin/stdout and opens `data/sessions.db` (or `$SP_DATA_DIR/sessions.db`) directly. It can run next to the Session Planner server; SQLite (WAL, busy timeout) serialises the writes. Open windows do not learn about its changes live (that needs the server process); reload the page.

Claude Code:

```bash
claude mcp add sessionplanner -- npm --prefix /path/to/sessionplanner run --silent mcp
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sessionplanner": {
      "command": "node",
      "args": ["--no-warnings", "/path/to/sessionplanner/server/mcp-stdio.ts"],
      "env": { "SP_DATA_DIR": "/path/to/sessionplanner/data" }
    }
  }
}
```

### Local OAuth (Claude Code)

With `SP_MCP_OAUTH=1` and no `SP_PUBLIC_URL`, the endpoint is `http://127.0.0.1:5175/mcp`. Approval is possible only from a browser on the same machine: both the connecting socket and the `Host` header must be loopback. claude.ai cannot use this, because its servers cannot reach your localhost.

### Static token

`SP_MCP_TOKEN=$(openssl rand -hex 32)` in `.env` makes `/mcp` additionally accept `Authorization: Bearer <token>`:

```bash
claude mcp add --transport http sessionplanner https://sessions.example.com/mcp --header "Authorization: Bearer <token>"
```

The token never expires and grants full access. Use it only where OAuth is not possible, and rotate it by changing `.env` and restarting. Clients that only speak stdio can bridge with `npx mcp-remote <url>`.

## Hosting behind Caddy and oauth2-proxy

The consent page must stay behind the login. Discovery, registration, token exchange, revocation and `/mcp` must be reachable without it, because Claude's servers call them without a browser session; they are protected by OAuth itself.

| Path | Login proxy | Why |
|---|---|---|
| `/oauth/authorize` | **behind** `forward_auth` | the human approval; Session Planner reads the signed-in e-mail from the proxy and checks it against `SP_OWNERS` |
| `/mcp` | bypass | needs an OAuth access token (or the static token) |
| `/.well-known/oauth-protected-resource*`, `/.well-known/oauth-authorization-server` | bypass | public metadata |
| `/oauth/register`, `/oauth/token`, `/oauth/revoke` | bypass | OAuth protocol endpoints, need a registered client, a code with PKCE or a token |
| everything else (UI, `/api/*`) | behind `forward_auth` | unchanged |

oauth2-proxy must return the e-mail of the signed-in user: start it with `--set-xauthrequest=true` (config file: `set_xauthrequest = true`). Session Planner already requires this header for the owner and guest model, so a working instance has it.

Caddyfile of the Session Planner host (adapt names and ports; keep your existing sign-in redirect handling in the second block):

```
sessions.example.com {
	# never trust this header from outside: only the proxy's answer may set it
	request_header -X-Auth-Request-Email

	@agent path /mcp /.well-known/oauth-protected-resource* /.well-known/oauth-authorization-server /oauth/register /oauth/token /oauth/revoke
	handle @agent {
		reverse_proxy sessionplanner:5175
	}

	handle {
		forward_auth oauth2-proxy:4180 {
			uri /oauth2/auth
			copy_headers X-Auth-Request-Email
		}
		reverse_proxy sessionplanner:5175
	}
}
```

Checklist after deploying:

- `curl -i https://sessions.example.com/mcp -X POST` → `401` with `WWW-Authenticate: Bearer resource_metadata="…"`.
- `curl https://sessions.example.com/.well-known/oauth-authorization-server` → JSON, no redirect to Microsoft.
- `curl -i -H 'X-Auth-Request-Email: you@example.com' 'https://sessions.example.com/oauth/authorize?client_id=x'` → the proxy's answer (redirect to the Microsoft sign-in or `401`), **not** Session Planner's "Unknown client" page. If you get a Session Planner page, the consent route is outside the login and the header can be forged – fix the Caddyfile before enabling OAuth.
- The container publishes no port: it must be reachable only through Caddy (`docker ps` shows no `0.0.0.0:5175->`).
- If Entra conditional access or a firewall restricts by IP: allow Anthropic's published egress range for connectors (see Anthropic's MCP connector documentation).

## Configuration

| Variable | Default | Effect |
|---|---|---|
| `SP_MCP_OAUTH` | off | `1` enables OAuth and `/mcp`. Hosted (`SP_PUBLIC_URL` set) the server already requires `SP_OWNERS`. |
| `SP_OWNERS` | – | The owners' e-mail addresses (case-insensitive); hosted, only they may approve connections. Empty = local mode (loopback browser only). |
| `SP_OWNER_HEADER` | `x-auth-request-email` | Header carrying the signed-in e-mail from the login proxy. |
| `SP_OAUTH_REDIRECTS` | – | Extra redirect URIs clients may register, comma-separated. Claude's callbacks and loopback are always allowed. |
| `SP_MCP_TOKEN` | – | Static bearer token for `/mcp`; works with or without OAuth. |
| `SP_PUBLIC_URL` | – | Public origin; becomes the OAuth issuer and the resource `…/mcp`. Must be exactly the URL entered in Claude. |

Token lifetimes: access token 1 hour, refresh token 30 days (renewed with every refresh, so an agent in regular use stays connected). Authorization codes live 60 seconds, the consent page 10 minutes.

## Tool reference

Conventions:

- **Workshops, items, groups and library entries** can be given by id or by title: exact (case-insensitive) first, current workshops before archived ones, else a unique partial match. Ambiguous titles return an error listing the candidates with ids. **Days** by id, by date (`YYYY-MM-DD`) or by number (1 = first day); `null` is the parking lot. **Categories** by id or name.
- **Clock times** are `HH:mm` (day start, target end, fixed starts); **durations** are minutes.
- **Placement** (`at`, `after`): where a new or moved entry goes among the entries of a day (or the members of a group). `at` is a 0-based index, `after` an item or group; without either, the end.
- **Updates** change only the fields you pass; `null` clears a field.
- **Slides** are addressed by where they live – a step (`workshop` + `item`) or a library entry (`entry`; for a group entry also the `item` inside it, by title or number) – and by id or number (1 = first).
- **Answers** carry computed times: every item in a day has `start` and `end`; a fixed start shows `gap` (free minutes before it) or `overlap` (the items before run into it); `late` marks an item that ends after the next fixed start or the target end. Days report `computedEnd`, `overTarget`, work and break minutes, the longest stretch without a break, and `warnings` in plain words. Empty fields are left out.
- **Errors** (unknown id, invalid time, rule violation) come back as a tool result with `isError` and a message the agent can act on.
- **Kind** is the MCP annotation clients use to decide whether to ask before a call: *read* never changes data, *write* only adds or changes reversibly, *destructive* may delete or overwrite something you wrote.

### Workshops

| Tool | Kind | Parameters | What it does |
|---|---|---|---|
| `workshop_list` | read | `includeArchived`, `query` | Title, client, dates, item count; newest first. |
| `workshop_get` | read | `workshop` | Details, every day with computed times and warnings, groups, parking lot, packing list, files. |
| `workshop_create` | write | `title`, `client`, `location`, `goal`, `notes`, `theme`, `date` (default today), `days` (consecutive, default 1), `start`, `end` (null = open end) | A workshop with its days; times default to the settings. |
| `workshop_update` | destructive | `workshop`, `title`, `client`, `location`, `goal`, `notes` (replaces, null clears), `appendNotes`, `theme` (`settings_get` lists them; `default` is the built-in one, null follows the settings), `archived` | Changes details. Archive with `archived: true`; workshops are never deleted through MCP. |
| `workshop_duplicate` | write | `workshop`, `title`, `firstDate` | A copy with the days moved so the first falls on `firstDate`; agenda, material and files come along, packing-list ticks are cleared. |

### Days

| Tool | Kind | Parameters | What it does |
|---|---|---|---|
| `day_add` | write | `workshop`, `date`, `start`, `end`, `at` | Adds a day (times default to the first day's). |
| `day_update` | destructive | `workshop`, `day`, `date`, `start`, `end` (null = open end) | Changes a day; items keep their order, times recompute. |
| `day_remove` | destructive | `workshop`, `day` | Removes a day; its items and groups go to the parking lot. |

### Items

| Tool | Kind | Parameters | What it does |
|---|---|---|---|
| `item_create` | write | `workshop`, `day`, `title`, `kind` (block \| break \| marker \| note), `duration`, `fixedStart`, `description`, `goal`, `method`, `lead`, `notes`, `materials[]` (`label`, `qty`, `link`), `category`, `color`, `slides[]` (each `html` \| `pool`), `group`, `at`, `after` | One item, by default at the end of the day. Returns it with its times and the day's warnings. |
| `item_create_many` | write | `workshop`, `day`, `items[]` (same fields), `group`, `at`, `after` | Several items in order, e.g. a whole agenda drafted from a brief. |
| `item_update` | destructive | `workshop`, `item`, any field above, `appendNotes` | Changes an item. Changing the kind to marker or note drops the duration; `slides[]` replaces the slides (the `slide_*` tools change single ones). |
| `item_move` | write | `workshop`, `item`, `day` (null = parking lot), `group` (null leaves the group), `at`, `after` | Moves within the day, to another day, into or out of a group, or to the parking lot. Moved to another day without a group, the item leaves its group. |
| `item_delete` | destructive | `workshop`, `item` | Deletes for good. Agents are told to prefer the parking lot. |

### Groups

| Tool | Kind | Parameters | What it does |
|---|---|---|---|
| `group_create` | write | `workshop`, `day`, `title`, `items[]`, `at`, `after` | A heading; the named items move into it in that order. Without a place the group stands where its first item was. |
| `group_update` | destructive | `workshop`, `group`, `title`, `day`, `at`, `after` | Renames or moves the group with its items. |
| `group_delete` | destructive | `workshop`, `group` | Removes the heading; its items stay in place, ungrouped. |

### Packing list

| Tool | Kind | Parameters | What it does |
|---|---|---|---|
| `packing_list` | read | `workshop` | Per material: quantity to pack (largest of any single placed item, or the override), which items need it, ticked, at the venue, links. |
| `packing_update` | write | `workshop`, `lines[]` (`label`, `qty` override or null, `checked`, `venue`), `add[]` (workshop-wide material), `remove[]` (labels of workshop-wide material) | Ticks, venue marks, overrides and material for the workshop as a whole. Lines are the ones `packing_list` shows (placed steps and workshop-wide material); material that belongs to a step is changed on the item, not removed here. |

### Library

| Tool | Kind | Parameters | What it does |
|---|---|---|---|
| `library_list` | read | – | Reusable items and groups shared by all workshops. |
| `library_save` | write | `workshop`, `item` or `group`, `title` | Saves a copy to the library. |
| `library_insert` | write | `workshop`, `entry`, `day`, `at`, `after` | Inserts a copy (an item, or a group with its items). |

### Slides

Slides live on a step of a workshop (`workshop` + `item`) or on a library entry (`entry`; for a group entry also `item`, the title or number of the item inside it). The pool (translated decks) is read-only: its slides are copied.

| Tool | Kind | Parameters | What it does |
|---|---|---|---|
| `slide_format` | read | `layout` | The slide format for writing markup: the rules, the common classes and every layout with its purpose, structure and a complete example; `layout` narrows it to one. |
| `slide_list` | read | target, `html` | The slides: number, id, layout, title, text; with `html: true` the markup. |
| `slide_get` | read | target + `slide` (id or number), or `pool` (pool slide id) | One slide with its full markup and the pictures (asset hashes) it shows. |
| `slide_add` | write | target, `html` \| `pool` or `slides[]` (each `html` \| `pool`), `at` | Adds one or several slides, by default at the end; answers with the numbers added. |
| `slide_update` | destructive | target, `slide`, `html` \| `replace[]` (`find`, `with`), `at` | New markup for the slide (its id stays), exact text replacements in the stored markup (every occurrence), or a new 0-based position – also combined; answers with the slide as stored. |
| `slide_remove` | destructive | target, `slide` or `slides[]` | Removes one or several slides. |
| `slide_set` | destructive | target, `slides[]` (each `html` \| `pool` \| `keep`) | Replaces the slides in the given order: markup, a pool copy, or an existing slide kept (id or number), which is how slides are reordered in bulk; an empty list removes all. |
| `pool_search` | read | `query`, `deck`, `layout` | The decks of the pool, and the slides whose deck, caption or text contain every word; `deck` (title or id) and `layout` narrow it. Ids for `slide_get`, `slide_add` and `slide_set`. |
| `deck_outline` | read | `workshop`, `agenda`, `breaks` | The deck as presented, with its theme: the generated title, agenda and break slides and the items' own, in order; `agenda` or `breaks` false leave the generated ones out, as the app can. |

Markup is reduced to the slide format on write (`docs/slides.md`, section 2; `slide_format` serves the same rules and an example per layout to the agent): anything outside the allowlist is removed, a slide without a `section.slide` root gets one, and the answers show the slide as stored, so the agent sees what survived. Pictures are referenced as `asset:<hash>`; an agent cannot upload pictures, so it reuses hashes that pool slides or other slides already show (`slide_get` lists them) or writes slides without pictures. Markers and notes have no slides.

### Settings

| Tool | Kind | Parameters | What it does |
|---|---|---|---|
| `settings_get` | read | – | Categories (id, name, colour), default day times, the slide themes the server has and the default one, what the item kinds mean. |

Files are listed by name only; uploading, downloading and deleting them stays in the app. Guests and sharing are managed in the app too.

## Rules the tools enforce

The tools share their rules with the app (`src/domain/`):

- Every write is validated like the browser's (`server/validate.ts`: field limits, link schemes, kinds, colours) and applied in one transaction; records of another workshop are refused.
- Times are computed (`src/domain/time.ts`), never stored: a fixed start is hard, the problem is shown, never solved silently.
- Markers and notes take no time; durations are whole minutes.
- Ordering by the same fractional positions as the app (`src/domain/order.ts`); a day's entries are renumbered when positions get too close.
- The packing list takes the largest quantity per label from the placed items (`src/domain/packing.ts`); parked items pack nothing.
- Library entries are copies both ways: saving copies the item, inserting copies the entry.
- Slides are stored sanitised (`src/domain/slides.ts`), whether they arrive as markup, as a text replacement or as a pool copy; a workshop's theme must be one the server has (`data/themes`).

The server also sends the agent short instructions on connect: read the workshop before changing it, draft from a brief with goal, method and lead, keep stretches without a break under 90 minutes, read `slide_format` before writing slides and a slide before editing it, prefer small reversible changes and report the computed end of the day.

## Security model

### Guests never get MCP access

Co-facilitators and clients who see shared workshops are guests: their e-mail is not in `SP_OWNERS`. Only an owner can approve a connection (the consent page refuses everyone else), only an owner can list or disconnect agents, and the static token is the owner's. There is no guest-scoped token and no way to grant one; a guest's Claude cannot connect to Session Planner at all.

### What protects what

| Asset / path | Protection |
|---|---|
| Web UI and `/api/*` | Login proxy (Microsoft Entra ID, MFA) plus the owner/guest model (`SP_OWNERS`, members) and the `x-sp` header on changes |
| Approving an agent (`/oauth/authorize`) | Login proxy **and** `SP_OWNERS`; locally: loopback socket and Host |
| Calling tools (`/mcp`) | Bearer access token issued after your approval (or the static token) |
| Obtaining tokens (`/oauth/token`) | Registered client + single-use 60-second code + S256 PKCE verifier, or a valid refresh token |
| Listing and disconnecting agents (`/api/mcp/connections`) | Owner only |
| Stored credentials | Only SHA-256 hashes of tokens in `oauth_tokens`; no client secrets exist |
| stdio | File system access to `data/` |

### Is OAuth more secure than the static token?

Not in cryptographic strength – both are 256-bit random values. The gain is in the lifecycle:

- **Human approval with MFA.** A token exists only after you signed in and pressed Allow; the static token is a value that anyone holding it can use.
- **Short-lived and rotating.** Access tokens expire after an hour. Each refresh token works once; if an already used refresh token is presented again later, the server assumes it was copied and revokes the whole connection.
- **Revocable per agent** in Settings, effective immediately, without restarting or reconfiguring other clients.
- **Tied to the owner list.** A token belongs to the owner who approved it; once that address is no longer in `SP_OWNERS`, the next call is refused and the next refresh ends the connection, however long the tokens would still live.
- **Narrow redirects.** Clients may register only Claude's callbacks (`https://claude.ai/api/mcp/auth_callback`, `https://claude.com/api/mcp/auth_callback`) and loopback addresses, so a third party cannot have authorization codes delivered to its own server.

What OAuth adds in exposure:

- Four endpoints reachable without login (metadata, register, token, revoke). They hand out nothing without your approval. Registration is open by design (Claude registers itself); idle registrations expire after 15 minutes and are capped, so a flood cannot block new connections.
- **Consent phishing.** Someone could start a connection and get you to press Allow. The page names the application and the destination host and warns when the destination is a program on your computer. Approve only connections you just started yourself.
- **Proxy configuration becomes part of the security.** If `/oauth/authorize` is reachable without the login, or the container port is reachable without Caddy, the e-mail header can be forged. The [checklist](#hosting-behind-caddy-and-oauth2-proxy) tests exactly this.

What neither protects against:

- An approved agent acts as the **owner**: it sees every workshop, including facilitation notes, and can change everything the owner can except files, sharing and deleting workshops. There are no read-only scopes yet. The tool annotations let Claude ask before destructive calls, but that is a client decision.
- Everything a tool returns is sent to the agent's model provider – workshop titles, client names, notes.
- Text from briefs or notes that the agent processes can contain instructions (prompt injection). The agent then acts with your permissions. Review what it reports it changed; daily backups (`data/backups/`) allow restoring.

## Operations

- **Disconnect an agent:** Session Planner → Settings → AI agents → Disconnect. All its tokens stop working at once; it must be approved again.
- **Disconnect all:** stop the server, `sqlite3 data/sessions.db 'DELETE FROM oauth_tokens; DELETE FROM oauth_clients;'`, start again.
- **Rotate the static token:** change `SP_MCP_TOKEN` in `.env`, restart.
- **Turn MCP off:** remove `SP_MCP_OAUTH` and `SP_MCP_TOKEN`, restart; `/mcp` then answers 404 and the OAuth routes no longer exist. Existing token rows become inert.
- **Backups** contain the token hashes; they cannot be turned back into tokens.
- **Concurrent edits:** the agent's changes are small operations like a second window's: per field, the later change wins (docs/concept.md, section 7). Open windows show them live.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Claude: "Couldn't reach the MCP server", the log shows nothing | `/mcp` or the metadata is behind the login proxy, which answers with a redirect | Add the `@agent` route ([Hosting](#hosting-behind-caddy-and-oauth2-proxy)); check the first two checklist items |
| Consent page says "Your account may not approve connections" | E-mail not in `SP_OWNERS`, or the proxy does not pass it | Check the address; `--set-xauthrequest=true`; `copy_headers X-Auth-Request-Email` |
| Consent page says "only … on the computer running Session Planner" while hosted | `SP_PUBLIC_URL` not set, so the server runs in local mode | Set `SP_PUBLIC_URL` and `SP_OWNERS` |
| "Invalid redirect" on the consent page | The client registered a redirect URI that is not Claude's or loopback | Add it to `SP_OAUTH_REDIRECTS` if you trust that client |
| Claude reports `invalid_target` | The URL entered in Claude differs from `SP_PUBLIC_URL` + `/mcp` (other host, `http`, trailing path) | Enter exactly `https://<SP_PUBLIC_URL host>/mcp` |
| Connector worked, now asks to sign in again | Refresh token expired (30 days unused), was revoked in Settings, replayed, or the approving address left `SP_OWNERS` | Reconnect; if you did not disconnect it, look at who else might hold the token |
| Agent changes do not show in the browser | The agent runs over stdio (no live updates) or the window lost its stream | Reload the page |
| "… matches several workshops" | Two workshops share the title | Give the id from `workshop_list`, or add the client to the query |

## Limitations

- No read-only or per-area scopes; one approval grants everything the owner can do through the tools.
- No CIMD (Client ID Metadata Documents); Claude falls back to dynamic registration, which it supports.
- Files cannot be uploaded, downloaded or deleted through MCP; they are listed by name. Pictures for slides cannot be uploaded either, and decks are added to the pool in the app.
- Sharing (guests) is managed in the app only.
- Workshops cannot be deleted through MCP (archive instead).
- Pending consent requests and authorization codes are kept in memory: a restart during sign-in means starting the connection again.
