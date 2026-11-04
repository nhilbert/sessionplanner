# Session Planner

This repository is **public**. The owner's name and contact details may appear; nothing else personal may:

- No real client, participant or workshop names, no e-mail addresses other than the owner's or `example.com`, no server addresses, host names or hosting details (those live in a separate private setup repository).
- Sample data, tests and screenshots use fictional data only.
- Real data stays in the gitignored `data/` folder; private material (e.g. sample sessions) in gitignored `private-*/` folders. Read them for inspiration, never copy their content into the repository.
- Never bypass the guard (`git commit --no-verify`, `git push --no-verify`); fix the content instead. Details: README.md, Privacy; `.githooks/guard.sh`.

## Note for agents: the privacy guard in a fresh cloud session

A new cloud session is a fresh clone. Two things are missing there, and without them the guard does not protect anything:

1. **The hooks are off** until `core.hooksPath` is set. `npm ci`/`npm install` set it (the `prepare` script); if you did not install, run `npm run hooks:install` before your first commit. Check with `git config core.hooksPath` (must print `.githooks`).
2. **The private patterns** (client names, server addresses, host names) live in `.git/info/private-patterns`, which is never committed, so a fresh clone has none. In a cloud environment they come from the environment variable `SP_PRIVATE_PATTERNS` instead (one extended regex per line, or one regex with `|`), which the owner sets once in the environment's settings; the guard reads both. Check with `[ -n "$SP_PRIVATE_PATTERNS" ]`.

If neither the file nor the variable is there: commits only warn and pushes are refused. Tell the owner (set `SP_PRIVATE_PATTERNS` in the environment settings, then a new session). Do not invent patterns, do not create a placeholder file to get past the check, and never use `--no-verify`. Do not print the variable's content into chat, commits or files: the patterns are the private data.

Concept, stages and decisions: docs/concept.md. Stack and conventions follow the sibling app Zendo.
