#!/usr/bin/env python3
"""Checks worksheet pages against the format before they are previewed, printed or uploaded (docs/worksheets.md):

    check.py FILE_OR_SHEETFOLDER ... [--root ROOT] [--theme NAME] [--no-render] [--json]

For every page (a .html file, or every .html file of a sheet folder with its sheet.json):
  - the root is one <section class="sheet"> or <section class="sheet landscape">
  - what the sanitiser (src/domain/sheets.ts, the slides' allowlist) would remove: elements and attributes
  - every element directly under the root other than the header is a block of the catalogue (class "block NAME")
  - classes the stylesheet does not know (usually a typo: the element is then unstyled)
  - pictures: assets/<file> that exists under the root, or asset:<hash>
  - elements marked class="todo"
  - unless --no-render: the page rendered in headless Chromium at paper size with the stylesheet, the theme and
    the fonts – blocks that run past the bottom margin, text that leaves its frame (a field, row, box, criterion)

The root (for assets/ and themes/) is --root, else the folder above sheets/ when the pages lie in
ROOT/sheets/<sheet>. Errors (sanitiser changes, unknown blocks, missing pictures, overflow) make the exit code 1;
warnings do not. Needs node and, for rendering, a headless Chromium ($CHROME; by default Playwright's)."""
import argparse, glob, json, os, re, subprocess, sys, tempfile
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import LATO_CSS, REPO, folder_theme, normalize_pages, sheet_meta  # noqa: E402

CSS = os.path.join(REPO, 'src', 'worksheets', 'sheets.css')
DEFAULT_THEME = os.path.join(REPO, 'src', 'slides', 'themes', 'default.css')
furl = lambda p: 'file://' + os.path.abspath(p)


class Tags(HTMLParser):
    """The elements of a fragment in order: (tag, sorted attribute names), and every class used."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags, self.classes, self.srcs, self.depth, self.top, self.todo = [], set(), [], 0, [], 0
        self.svg = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'svg' and 'drawn' in (a.get('class') or '').split(): self.svg += 1
        if not self.svg:
            self.tags.append((tag, tuple(sorted(k for k in a))))
            cls = (a.get('class') or '').split()
            self.classes.update(cls)
            if 'todo' in cls: self.todo += 1
            if a.get('src'): self.srcs.append(a['src'])
            if self.depth == 1: self.top.append((tag, cls))
        if tag not in ('br', 'img'): self.depth += 1

    def handle_endtag(self, tag):
        if tag not in ('br', 'img'): self.depth -= 1
        if tag == 'svg' and self.svg: self.svg -= 1


def parse(markup):
    t = Tags(); t.feed(markup); return t


def known_classes():
    css = open(CSS, encoding='utf-8').read()
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    return set(re.findall(r'\.([A-Za-z][A-Za-z0-9_-]*)', css))


MEASURE = r'''
<script>
document.fonts.ready.then(() => setTimeout(() => {
  const s = document.querySelector('.sheet'), r = s.getBoundingClientRect(), cs = getComputedStyle(s);
  const bottom = r.bottom - parseFloat(cs.paddingBottom) + 1, right = r.right - parseFloat(cs.paddingRight) + 1;
  const out = [];
  const name = (el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '')) + (el.textContent.trim() ? ' "' + el.textContent.trim().slice(0, 40) + '"' : '');
  for (const el of s.querySelectorAll(':scope > :not(.sheet-foot):not(.sheet-head), :scope > * *')) {
    if (el.closest('.sheet-foot, .sheet-head, svg')) continue;
    const b = el.getBoundingClientRect();
    if (b.height && b.bottom > bottom) { out.push('runs past the bottom margin by ' + ((b.bottom - bottom) / 3.78).toFixed(1) + ' mm: ' + name(el)); }
    else if (b.width && b.right > right) { out.push('runs past the right margin by ' + ((b.right - right) / 3.78).toFixed(1) + ' mm: ' + name(el)); }
  }
  for (const el of s.querySelectorAll('.block, .field, .row, .box, .crit')) {
    const eb = el.getBoundingClientRect();
    if ([...el.children].some(c => { const cb = c.getBoundingClientRect(); return cb.height && (cb.bottom > eb.bottom + 1.5 || cb.right > eb.right + 1.5); }))
      out.push('content leaves its frame: ' + name(el));
  }
  for (const img of s.querySelectorAll('img')) if (!img.complete || !img.naturalWidth) out.push('picture did not load: ' + img.getAttribute('src'));
  document.getElementById('result').textContent = JSON.stringify([...new Set(out)].slice(0, 12));
}, 50));
</script>'''


def render(page, root, theme_css, theme, chrome_bin, paper):
    """Problems of the rendered page: overflow, frames, pictures."""
    lato = ''.join(f'<link rel="stylesheet" href="{furl(os.path.join(REPO, "node_modules", "@fontsource", "lato", c))}">' for c in LATO_CSS)
    fonts = f'<link rel="stylesheet" href="{furl(os.path.join(REPO, "node_modules", "@fontsource-variable", "inter", "index.css"))}"><link rel="stylesheet" href="{furl(os.path.join(REPO, "node_modules", "@fontsource-variable", "manrope", "index.css"))}">{lato}'
    page = re.sub(r'src="(assets/[^"]+)"', lambda m: f'src="{furl(os.path.join(root, m.group(1)))}"', page)
    at = page.rfind('</section>')
    page = page[:at] + '<div class="sheet-foot"></div>' + page[at:]
    doc = f'''<!doctype html><html data-theme="{theme}"><head><meta charset="utf-8">{fonts}<link rel="stylesheet" href="{furl(CSS)}"><link rel="stylesheet" href="{furl(theme_css)}"><style>body{{margin:0}}</style></head>
<body class="paper-{paper.lower()}">{page}<pre id="result"></pre>{MEASURE}</body></html>'''
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(doc); path = f.name
    try:
        r = subprocess.run([chrome_bin, '--headless', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', '--window-size=1700,1700', '--virtual-time-budget=6000', '--dump-dom', furl(path)], capture_output=True, text=True, timeout=60)
    finally:
        os.unlink(path)
    m = re.search(r'<pre id="result">(.*?)</pre>', r.stdout, re.S)
    if not m or not m.group(1).strip(): return ['the page could not be rendered']
    import html as h
    return json.loads(h.unescape(m.group(1)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('paths', nargs='+')
    ap.add_argument('--root'); ap.add_argument('--theme'); ap.add_argument('--no-render', action='store_true'); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    jobs = []
    for p in a.paths:
        p = os.path.abspath(p)
        folder = p if os.path.isdir(p) else os.path.dirname(p)
        files = sorted(glob.glob(os.path.join(p, '*.html'))) if os.path.isdir(p) else [p]
        meta = sheet_meta(folder) if os.path.exists(os.path.join(folder, 'sheet.json')) else {'paper': 'A4'}
        root = a.root or (os.path.dirname(os.path.dirname(folder)) if os.path.basename(os.path.dirname(folder)) == 'sheets' else folder)
        meta = {**meta, 'theme': folder_theme(root, a.theme)}
        for f in files: jobs.append((f, root, meta))
    sources = [open(f, encoding='utf-8').read() for f, _, _ in jobs]
    stored, blocks = normalize_pages(sources, with_blocks=True)
    css_classes = known_classes() | set(blocks)
    # the names of blocks proper (the bridge gives modifiers too, which are not blocks of their own)
    from common import bridge as _b  # noqa: F401
    modifier_only = set(blocks) - set(json.loads(subprocess.run(['node', '--no-warnings', '--input-type=module', '-e', "const m = await import('" + REPO + "/src/domain/sheets.ts'); process.stdout.write(JSON.stringify(m.SHEET_BLOCK_NAMES))"], capture_output=True, text=True).stdout))
    chrome_bin = os.environ.get('CHROME') or (sorted(glob.glob(os.path.expanduser('~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'))) or [''])[-1]
    report, failed = {}, False
    for (f, root, meta), src, out in zip(jobs, sources, stored):
        errors, warnings = [], []
        if not re.match(r'\s*<section class="sheet(?: landscape)?">', src): errors.append('the root is not <section class="sheet"> or <section class="sheet landscape">')
        # what the app draws from the entries (a circle, a shape, a scale's points) is not the author's markup
        drawn = re.sub(r'<svg class="drawn".*?</svg>|<div class="points drawn">.*?</div>', '', out, flags=re.S)
        before, after = parse(src), parse(drawn)
        if before.tags != after.tags:
            gone = [t for t in before.tags if t not in after.tags] or ['the order or nesting of elements']
            errors.append(f'the sanitiser changes the page: {gone[:4]}')
        for tag, cls in after.top:
            if tag == 'header': continue
            if 'block' not in cls or len(cls) < 2 or cls[1] not in blocks or cls[1] in modifier_only:
                errors.append(f'not a block of the catalogue under the root: <{tag} class="{" ".join(cls)}">')
        unknown = sorted(c for c in after.classes if c not in css_classes and c not in ('sheet', 'todo'))
        if unknown: warnings.append(f'classes the stylesheet does not know: {", ".join(unknown)}')
        for s in after.srcs:
            if s.startswith('assets/') and not os.path.exists(os.path.join(root, s)): errors.append(f'picture not found: {s}')
            elif not s.startswith(('assets/', 'asset:')): errors.append(f'picture neither assets/<file> nor asset:<hash>: {s}')
        if after.todo: warnings.append(f'{after.todo} element(s) marked todo')
        if not a.no_render and not errors:
            if not chrome_bin: warnings.append('no headless Chromium: not rendered')
            else:
                theme = meta['theme']
                tc = os.path.join(root, 'themes', theme + '.css')
                errors += render(out, root, tc if os.path.exists(tc) else DEFAULT_THEME, theme, chrome_bin, meta['paper'])
        report[os.path.relpath(f)] = {'errors': errors, 'warnings': warnings}
        failed = failed or bool(errors)
    if a.json: print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        for f, r in report.items():
            status = 'FAIL' if r['errors'] else 'ok  '
            print(f'{status} {f}')
            for e in r['errors']: print(f'     error: {e}')
            for w in r['warnings']: print(f'     warn:  {w}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
