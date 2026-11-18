#!/usr/bin/env bash
# Screenshots of every page and a PDF of every sheet, from the pages build.py wrote:
#   render.sh ROOT/sheet.html …      screenshots into $OUT (default ROOT/shots), PDFs into $PDF (default ROOT/print)
# The PDF is the browser's print of ROOT/<sheet>.print.html: the test print of stage 1 (docs/worksheets.md).
# Needs a headless Chromium ($CHROME; default: the one Playwright installs).
set -euo pipefail
CHROME="${CHROME:-$(ls -d "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null | sort | tail -1 || true)}"
[[ -x $CHROME ]] || { echo "no headless Chromium found; set CHROME" >&2; exit 1; }
run() { "$CHROME" --headless --no-sandbox --disable-gpu --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=5000 "$@" >/dev/null 2>&1; }
uri() { python3 -c 'import pathlib, sys; print(pathlib.Path(sys.argv[1]).as_uri())' "$1"; }
for page in "$@"; do
  # the print pages and the index are not sheets of their own
  case "$page" in
    */all.print.html|all.print.html)
      dest="${PDF:-$(dirname "$(realpath "$page")")/print}"; mkdir -p "$dest"
      run --no-pdf-header-footer --print-to-pdf="$dest/alle-blaetter.pdf" "$(uri "$(realpath "$page")")"; echo "all sheets -> $dest/alle-blaetter.pdf"; continue ;;
    *.print.html|*/index.html|index.html) continue ;;
  esac
  page=$(realpath "$page"); dir=$(dirname "$page"); sheet=$(basename "${page%.html}")
  out="${OUT:-$dir/shots}"; pdf="${PDF:-$dir/print}"; mkdir -p "$out" "$pdf"
  n=$(grep -o 'class="page-frame"' "$page" | wc -l)
  # page size at 96 dpi: the width and height of each page in px, landscape or portrait
  sizes=$(python3 - "$page" <<'EOF'
import re, sys
t = open(sys.argv[1], encoding='utf-8').read()
paper = re.search(r'<main class="paper-(a\d)"', t).group(1)
w, h = {'a4': (210, 297), 'a3': (297, 420), 'a5': (148, 210)}[paper]
for land in re.findall(r'<div class="item( landscape)?">', t):
    a, b = (h, w) if land else (w, h)
    print(f'{round(a * 96 / 25.4)},{round(b * 96 / 25.4)}')
EOF
)
  i=0
  for size in $sizes; do i=$((i + 1)); run --force-device-scale-factor=1.5 --window-size="$size" --screenshot="$out/$sheet-$(printf %02d "$i").png" "$(uri "$page")?only=$i"; done
  run --no-pdf-header-footer --print-to-pdf="$pdf/$sheet.pdf" "$(uri "$dir/$sheet.print.html")"
  echo "$sheet: $n pages -> $out, $pdf/$sheet.pdf"
done
