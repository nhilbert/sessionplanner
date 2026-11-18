#!/usr/bin/env python3
"""Builds the static preview and the print pages of a folder of worksheets (docs/worksheets.md, stage 1):

    build.py ROOT

ROOT/sheets/<sheet>/sheet.json  title, version ("v1.0 · Nov 2026"), theme, paper (A4, A3, A5), duplex
ROOT/sheets/<sheet>/NN-*.html   one page per file: <section class="sheet"> or <section class="sheet landscape">
ROOT/themes/<theme>.css         the installation's themes; the neutral default comes from the repository
ROOT/themes/<theme>/paper.json  optional: {"logo": "logo.png", "logoAt": "foot" | "head" | "head-right" | "none"}
ROOT/assets/<file>              pictures, written as src="assets/<file>" (the app stores them as asset:<hash>)

Every page is stored as the app would store it (src/domain/sheets.ts: sanitised, circles drawn), then the host's
chrome is added: the logo where the theme puts it, the footer with the version and, on sheets of several pages, the
page number. Writes ROOT/format/ (stylesheets and fonts), ROOT/<sheet>.html (the pages scaled to the window,
?only=N for page N at its real size), ROOT/<sheet>.print.html (the pages at paper size, for print to PDF) and
ROOT/all.print.html (every A4 sheet, for one test print) and ROOT/index.html. Needs node (the domain module runs as TypeScript)."""
import html, json, os, re, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import LATO_CSS, REPO, copy_fonts, font_links, normalize_pages, sheet_meta, sheet_pages, theme_paper  # noqa: E402

root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
sheets_dir = os.path.join(root, 'sheets')
fmt = os.path.join(root, 'format'); os.makedirs(os.path.join(fmt, 'themes'), exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
shutil.copy(os.path.join(REPO, 'src', 'worksheets', 'sheets.css'), fmt)
shutil.copy(os.path.join(here, 'preview.css'), fmt)
shutil.copy(os.path.join(REPO, 'src', 'slides', 'themes', 'default.css'), os.path.join(fmt, 'themes'))
copy_fonts(fmt)

PAPER = {'A4': (210, 297), 'A3': (297, 420), 'A5': (148, 210)}

JS = r'''
(function () {
  const q = new URLSearchParams(location.search);
  const only = q.get('only');
  if (only) {
    document.body.classList.add('only');
    const page = document.querySelectorAll('.page-frame .sheet')[parseInt(only, 10) - 1];
    const single = document.createElement('div'); single.className = 'single ' + document.querySelector('main').className;
    single.appendChild(page.cloneNode(true)); document.body.appendChild(single); return;
  }
  function fit() { document.querySelectorAll('.page-frame').forEach(f => { const s = f.querySelector('.sheet'); f.style.setProperty('--s', f.clientWidth / s.offsetWidth); f.style.height = s.offsetHeight * f.clientWidth / s.offsetWidth + 'px'; }); }
  fit(); new ResizeObserver(fit).observe(document.body); document.fonts && document.fonts.ready.then(fit);
})();
'''


def theme_href(theme):
    return f'themes/{theme}.css' if os.path.exists(os.path.join(root, 'themes', theme + '.css')) else f'format/themes/{theme}.css'


def chrome(page, n, total, meta, paper):
    """The host's part of a page: the logo where the theme puts it and the footer line."""
    logo = paper.get('logo')
    at = paper.get('logoAt', 'foot') if logo else 'none'
    img = f'<img src="{html.escape(logo)}" alt="">' if logo else ''
    num = f'<span class="page">{n}/{total}</span>' if total > 1 else ''
    foot = f'<div class="sheet-foot"><span class="version">{html.escape(meta.get("version", ""))}</span>{num}{img if at == "foot" else "<span></span>"}</div>'
    head = f'<div class="sheet-head{" right" if at == "head-right" else ""}">{img}</div>' if at in ('head', 'head-right') else ''
    if head: page = re.sub(r'^<section class="sheet', '<section class="sheet logo-head', page, count=1)
    at_end = page.rfind('</section>')
    return page[:at_end] + head + foot + page[at_end:]


index = []
all_prints = []  # every A4 sheet, each page in its theme: one test print of the whole folder
for name in sorted(os.listdir(sheets_dir)) if os.path.isdir(sheets_dir) else []:
    d = os.path.join(sheets_dir, name)
    if not os.path.isdir(d) or not os.path.exists(os.path.join(d, 'sheet.json')): continue
    meta = sheet_meta(d)
    theme = meta['theme']
    paper = theme_paper(root, theme)
    files = sheet_pages(d)
    pages = normalize_pages([open(os.path.join(d, f), encoding='utf-8').read() for f in files])
    total = len(pages)
    size = meta['paper']
    w, h = PAPER.get(size, PAPER['A4'])
    frames, prints = [], []
    for n, (f, page) in enumerate(zip(files, pages), 1):
        full = chrome(page, n, total, meta, paper)
        land = ' landscape' if re.match(r'<section class="sheet[^"]*\blandscape\b', page) else ''
        todo = ' <em>todo</em>' if re.search(r'class="[^"]*\btodo\b', page) else ''
        frames.append(f'<div class="item{land}"><div class="page-frame">{full}</div><div class="cap"><b>{n:02d}</b><span>{html.escape(f)}</span>{todo}</div></div>')
        prints.append(full)
    head = f'''<meta charset="utf-8"><title>{html.escape(meta["title"])}</title>{font_links()}<link rel="stylesheet" href="format/sheets.css"><link rel="stylesheet" href="{html.escape(theme_href(theme))}">'''
    cls = f'paper-{size.lower()}'
    open(os.path.join(root, name + '.html'), 'w', encoding='utf-8').write(f'''<!doctype html>
<html lang="de" data-theme="{html.escape(theme)}"><head>{head}<link rel="stylesheet" href="format/preview.css"></head>
<body><div class="top"><a href="index.html">← Blätter</a><h1>{html.escape(meta["title"])}</h1><span>{total} {"Seite" if total == 1 else "Seiten"} · {size}{" doppelseitig" if meta["duplex"] else ""} · Theme {html.escape(theme)}</span><a class="print" href="{html.escape(name)}.print.html">Druckansicht</a></div>
<main class="{cls}">{"".join(frames)}</main>
<script>{JS}</script></body></html>''')
    # Print: each page on a sheet of its paper; landscape pages on a page of their own orientation.
    open(os.path.join(root, name + '.print.html'), 'w', encoding='utf-8').write(f'''<!doctype html>
<html lang="de" data-theme="{html.escape(theme)}"><head>{head}<style>
@page {{ size: {w}mm {h}mm; margin: 0; }}
@page landscape {{ size: {h}mm {w}mm; margin: 0; }}
html, body {{ margin: 0; background: #fff; }}
.sheet {{ break-after: page; }}
.sheet.landscape {{ page: landscape; }}
</style></head><body class="{cls}">{"".join(prints)}</body></html>''')
    if size == 'A4': all_prints.append(f'<div data-theme="{html.escape(theme)}" class="paper-a4">{"".join(prints)}</div>')
    index.append(f'<li><a href="{html.escape(name)}.html">{html.escape(meta["title"])}</a><div class="meta">{total} {"Seite" if total == 1 else "Seiten"} · {html.escape(meta.get("version", ""))} · Theme {html.escape(theme)}</div></li>')
    print(f'{name}.html: {total} pages ({theme}, {size})')
themes = sorted({t for t in re.findall(r'data-theme="([^"]+)"', ''.join(all_prints))})
links = ''.join(f'<link rel="stylesheet" href="{html.escape(theme_href(t))}">' for t in themes)
open(os.path.join(root, 'all.print.html'), 'w', encoding='utf-8').write(f'''<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Alle Blätter</title>{font_links()}<link rel="stylesheet" href="format/sheets.css">{links}<style>
@page {{ size: 210mm 297mm; margin: 0; }}
@page landscape {{ size: 297mm 210mm; margin: 0; }}
html, body {{ margin: 0; background: #fff; }}
.sheet {{ break-after: page; }}
.sheet.landscape {{ page: landscape; }}
</style></head><body>{"".join(all_prints)}</body></html>''')
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(f'''<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Arbeitsblätter</title><link rel="stylesheet" href="format/preview.css"></head>
<body><div class="top"><h1>Arbeitsblätter</h1></div><ul class="sheets">{"".join(index)}</ul></body></html>''')
