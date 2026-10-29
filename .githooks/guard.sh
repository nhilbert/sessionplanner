#!/usr/bin/env bash
# Privacy guard for this public repository, used by pre-commit, commit-msg and pre-push.
#
# Refuses:
#   - private files (data/, private-*/ folders, .env, databases)
#   - anything matching a line of .git/info/private-patterns (server addresses and host names, clients, people …).
#     That file lives inside .git, so it is never committed or pushed; create it once per clone (README, Privacy).
#   - e-mail addresses other than your own (git config user.email), example domains and noreply addresses,
#     so no client's or participant's address slips in
#   - public IPv4 addresses
#   - API keys and tokens
# Your own name, e-mail and contact data may appear (owner's decision, 2026-10-29).
set -euo pipefail

ALLOWED_EMAIL='@(example\.(com|org|net)|users\.noreply\.github\.com)$|^noreply@(anthropic|github)\.com$'
own=$(git config user.email || true)
[[ -n $own ]] && ALLOWED_EMAIL+="|^$(sed 's/[.[\*^$()+?{|]/\\&/g' <<<"$own")\$"
PRIVATE_FILES='^data/|(^|/)private-[^/]*/|(^|/)\.env$|\.db$|\.db-(journal|wal|shm)$|\.sqlite3?$'
SECRETS='sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{32,}|AKIA[0-9A-Z]{16}|"refresh_token"|"access_token"'

patterns_file=$(git rev-parse --git-path info/private-patterns)
private_re=''
if [[ -f $patterns_file ]]; then
  private_re=$(grep -v -E '^\s*(#|$)' "$patterns_file" | paste -sd'|' || true)
fi

fail() {
  printf '\n\033[31mPrivacy guard:\033[0m %s\n' "$1" >&2
  [[ -n ${2:-} ]] && printf '%s\n' "$2" | sed 's/^/  /' >&2
  printf '\nThis repository is public. Remove it, or see README.md (Privacy).\n\n' >&2
  exit 1
}

# Prints the offending pieces of text read from stdin; `ips` = also look for public IPv4 addresses.
scan() {
  local text hits=''
  text=$(cat)
  if [[ -n $private_re ]]; then hits+=$(grep -o -i -E "$private_re" <<<"$text" | sort -u || true)$'\n'; fi
  hits+=$(grep -o -E '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' <<<"$text" | grep -v -i -E "$ALLOWED_EMAIL" | sort -u || true)$'\n'
  hits+=$(grep -o -E "$SECRETS" <<<"$text" | sort -u || true)$'\n'
  if [[ ${1:-} == ips ]]; then
    hits+=$(grep -o -E '(^|[^0-9.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)' <<<"$text" | grep -o -E '([0-9]{1,3}\.){3}[0-9]{1,3}' |
      grep -v -E '^(0|10|127|255)\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^169\.254\.|^192\.0\.2\.|^198\.51\.100\.|^203\.0\.113\.' |
      awk -F. '$1<=255 && $2<=255 && $3<=255 && $4<=255' | sort -u || true)
  fi
  grep -v '^$' <<<"$hits" || true
}

case ${1:-} in
pre-commit)
  [[ -n $private_re ]] || printf '\033[33mPrivacy guard:\033[0m %s is missing – server details and client names are not checked (README.md, Privacy).\n' "$patterns_file" >&2
  bad=$(git diff --cached --name-only --diff-filter=ACMR | grep -E "$PRIVATE_FILES" || true)
  [[ -z $bad ]] || fail 'private files staged:' "$bad"
  bad=$(git diff --cached --name-only --diff-filter=ACMR | scan || true)
  [[ -z $bad ]] || fail 'a file name contains:' "$bad"
  added() { git diff --cached -U0 --no-color -- "$@" | grep -E '^\+' | grep -v -E '^\+\+\+ ' || true; }
  # The guard's own files hold the patterns it looks for; the lock file holds version numbers that look like addresses.
  bad=$( { added . ':(exclude)package-lock.json' ':(exclude).githooks/*' | scan ips; added package-lock.json | scan; } || true)
  [[ -z $bad ]] || fail 'the staged changes contain:' "$bad"
  ;;
commit-msg)
  bad=$(grep -v '^#' "$2" | scan ips || true)
  [[ -z $bad ]] || fail 'the commit message contains:' "$bad"
  ;;
pre-push)
  [[ -n $private_re ]] || fail "$patterns_file is missing, so server details and client names cannot be checked." 'Create it (README.md, Privacy), then push again.'
  zero=0000000000000000000000000000000000000000
  while read -r _local_ref local_sha _remote_ref _remote_sha; do
    [[ $local_sha == "$zero" ]] && continue # deleting a branch publishes nothing
    for c in $(git rev-list "$local_sha" --not --remotes); do
      short=$(git rev-parse --short "$c")
      bad=$(git log -1 --format=%B "$c" | scan ips || true)
      [[ -z $bad ]] || fail "commit $short: the message contains:" "$bad"
      bad=$(git diff-tree --root --no-commit-id --name-only -r "$c" | grep -E "$PRIVATE_FILES" || true)
      [[ -z $bad ]] || fail "commit $short adds private files:" "$bad"
      bad=$( { git show --format= -U0 --no-color "$c" -- . ':(exclude)package-lock.json' ':(exclude).githooks/*' | grep -E '^\+' | scan ips
        git show --format= -U0 --no-color "$c" -- package-lock.json | grep -E '^\+' | scan; } || true)
      [[ -z $bad ]] || fail "commit $short contains:" "$bad"
    done
  done
  ;;
*)
  echo "usage: guard.sh pre-commit|commit-msg <file>|pre-push" >&2
  exit 2
  ;;
esac
exit 0
