#!/usr/bin/env bash
# Screenshots of every slide (1280×720) and contact sheets of six, from the pages build.py wrote:
#   render.sh ROOT/deck.html …        output into $OUT (default: ROOT/shots)
# Needs a headless Chromium ($CHROME; default: the one Playwright installs).
set -euo pipefail
CHROME="${CHROME:-$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | sort | tail -1)}"
[[ -x $CHROME ]] || { echo "no headless Chromium found; set CHROME" >&2; exit 1; }
shot() { "$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars --virtual-time-budget=4000 --window-size="$1" --screenshot="$2" "$3" >/dev/null 2>&1; }
for page in "$@"; do
  page=$(realpath "$page"); dir=$(dirname "$page"); deck=$(basename "${page%.html}")
  out="${OUT:-$dir/shots}"; mkdir -p "$out"
  n=$(grep -o 'class="frame"' "$page" | wc -l)
  for ((i = 1; i <= n; i++)); do shot 1280,720 "$out/$deck-$(printf %02d "$i").png" "file://$page?only=$i"; done
  sheets=$(( (n + 5) / 6 ))
  for ((k = 0; k < sheets; k++)); do left=$(( n - k * 6 )); rows=$(( (left < 6 ? left : 6) + 1 )); rows=$(( rows / 2 )); shot "1280,$((rows * 360))" "$out/$deck-sheet$k.png" "file://$page?sheet=$k"; done
  echo "$deck: $n slides, $sheets sheets -> $out"
done
