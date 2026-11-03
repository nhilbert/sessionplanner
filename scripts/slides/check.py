#!/usr/bin/env python3
"""Checks slide fragments against the slide format before they are previewed or uploaded (docs/slides.md;
the skills .claude/skills/slide-build and deck-translate):

    check.py FILE_OR_DECKFOLDER ... [--themes DIR] [--theme NAME] [--no-render] [--json]

For every fragment (a .html file, or every .html file of a deck folder):
  - the root is one <section class="slide LAYOUT"> with a layout of the catalogue (src/domain/slideFormat.ts)
  - what the server's sanitiser (src/domain/slides.ts) would remove – elements, attributes, text – found by
    running the real sanitiser under node
  - classes the stylesheet and the theme do not know (usually a typo: the element is then unstyled)
  - how much is on the slide, against what the layout holds (points, cards, steps, lines, words)
  - pictures: asset:<hash> (kept as written) or assets/<file> that exists next to the deck or under the root
  - elements marked class="todo"
  - unless --no-render: the fragment rendered in headless Chromium at 1280 × 720 with the stylesheet, the theme
    and the fonts – text that leaves the slide or its card, titles that wrap to three lines, pictures that did
    not load

The theme: --theme, else the deck.json next to the fragments, else the default; its stylesheet is looked for in
--themes (ROOT/themes of a preview folder when the fragments lie in ROOT/decks/<deck>), as NAME.css or
NAME/theme.css. Warnings are printed; errors (sanitiser changes, unknown layout, missing picture, overflow)
make the exit code 1. Needs node (the domain modules run as TypeScript) and, for rendering, a headless
Chromium ($CHROME; by default the one Playwright installs)."""
import argparse, base64, glob, json, os, re, struct, subprocess, sys, tempfile, zlib
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CSS = os.path.join(REPO, 'src', 'slides', 'slides.css')
DEFAULT_THEME = os.path.join(REPO, 'src', 'slides', 'themes', 'default.css')
INTER = os.path.join(REPO, 'node_modules', '@fontsource-variable', 'inter', 'index.css')
MANROPE = os.path.join(REPO, 'node_modules', '@fontsource-variable', 'manrope', 'index.css')
NOTO = os.path.join(REPO, 'node_modules', '@fontsource', 'noto-sans-jp', '400.css')
# Stands in for assets/<file> while the sanitiser runs: it accepts asset:<hash> only.
STAND_IN = 'asset:' + '0' * 64

furl = lambda p: 'file://' + os.path.abspath(p)


# ---- the domain modules, run by node ------------------------------------------------------------------------------
BRIDGE = r'''
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const repo = process.env.SP_REPO
const { normalizeSlideHtml } = await import(pathToFileURL(repo + '/src/domain/slides.ts').href)
const { SLIDE_LAYOUTS } = await import(pathToFileURL(repo + '/src/domain/slideFormat.ts').href)
const fragments = JSON.parse(readFileSync(0, 'utf8'))
process.stdout.write(JSON.stringify({ layouts: SLIDE_LAYOUTS.map((l) => l.layout), sanitized: fragments.map((h) => normalizeSlideHtml(h)) }))
'''


def bridge(fragments):
    """The catalogue's layout names and every fragment as the server would store it."""
    r = subprocess.run(['node', '--no-warnings', '--input-type=module', '-e', BRIDGE], input=json.dumps(fragments), capture_output=True, text=True, env={**os.environ, 'SP_REPO': REPO})
    if r.returncode:
        sys.exit(f'node could not run the domain modules (node 22.6 or newer, run from the repository):\n{r.stderr.strip()}')
    return json.loads(r.stdout)


# ---- a small tree over the markup ---------------------------------------------------------------------------------
VOID = {'br', 'img'}


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []

    @property
    def classes(self):
        return set((self.attrs.get('class') or '').split())

    def all(self):
        for c in self.children:
            if isinstance(c, Node):
                yield c
                yield from c.all()

    def plain(self):
        return re.sub(r'\s+', ' ', ''.join(c if isinstance(c, str) else c.plain() for c in self.children)).strip()

    def ancestors(self):
        n = self.parent
        while n:
            yield n
            n = n.parent

    def items(self):
        """Direct li children."""
        return [c for c in self.children if isinstance(c, Node) and c.tag == 'li']


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#root', [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.children.append(data)


def parse(frag):
    t = Tree()
    t.feed(frag)
    t.close()
    return t.root


def short(text, n=48):
    return text if len(text) <= n else text[: n - 1] + '…'


# ---- what the sanitiser takes out ---------------------------------------------------------------------------------
def inventory(frag):
    tags, attrs = {}, {}
    root = parse(frag)
    for n in root.all():
        tags[n.tag] = tags.get(n.tag, 0) + 1
        for a in n.attrs:
            attrs[(n.tag, a)] = attrs.get((n.tag, a), 0) + 1
    return tags, attrs, root.plain()


def sanitiser_diff(frag, clean):
    """What the stored slide lacks against the written one: elements, attributes, text."""
    t1, a1, text1 = inventory(frag)
    t2, a2, text2 = inventory(clean)
    gone = []
    for tag, n in sorted(t1.items()):
        d = n - t2.get(tag, 0)
        if d > 0:
            gone.append(f'<{tag}>' + (f' ×{d}' if d > 1 else ''))
    for (tag, a), n in sorted(a1.items()):
        d = n - a2.get((tag, a), 0)
        if d > 0:
            gone.append(f'{a} on <{tag}>' + (f' ×{d}' if d > 1 else ''))
    if text1 != text2:
        gone.append('some text')
    return gone


# ---- the classes the stylesheet knows -----------------------------------------------------------------------------
def css_classes(*paths):
    known = {'todo', 'chrome', 'cols-3'}  # todo is the author's mark, chrome the host's footer, cols-3 the default column count
    for p in paths:
        if not p or not os.path.exists(p):
            continue
        css = re.sub(r'/\*.*?\*/', '', open(p, encoding='utf-8').read(), flags=re.S)
        prev = None
        while prev != css:  # drop declaration blocks, innermost first; a block of rules (inside @media) stays
            prev = css
            css = re.sub(r'\{([^{}]*)\}', lambda m: ' ' if ':' in m.group(1) or not m.group(1).strip() else m.group(0), css)
        known.update(re.findall(r'\.([A-Za-z_][\w-]*)', css))
    return known


# ---- how much fits --------------------------------------------------------------------------------------------------
def fits_checks(layout, sec):
    out = []
    warn = lambda msg: out.append(('warning', msg))
    note = lambda msg: out.append(('note', msg))
    words = lambda n: len(n.plain().split())

    def lists(tag, cls):
        return [n for n in sec.all() if n.tag == tag and cls in n.classes and not any(a.tag in ('ul', 'ol') for a in n.ancestors())]

    for h in (n for n in sec.all() if n.tag == 'h2'):
        if len(h.plain()) > 90:
            warn(f'a title of {len(h.plain())} characters wraps to three lines; two lines hold about 80')
    h1_limit = {'title': 40, 'section': 55}.get(layout, 70)
    for h in (n for n in sec.all() if n.tag == 'h1'):
        if len(h.plain()) > h1_limit:
            warn(f'a title of {len(h.plain())} characters wraps to three lines on a {layout} slide; two lines hold about {h1_limit}')
    if layout == 'list':
        ls = lists('ul', 'list') + lists('ol', 'list')
        n = sum(len(l.items()) for l in ls)
        cls = set().union(*(l.classes for l in ls)) if ls else set()
        limit = 13 if cls & {'compact', 'two', 'four'} else 6 if 'rows' in cls else 10
        if n > limit:
            warn(f'{n} points: the layout holds about {limit} of this kind, fewer when a point takes two lines; split the slide' + ('' if cls & {'compact', 'two', 'four'} else ', or use .compact for short points'))
        elif n > 6 and not cls & {'compact', 'two', 'four', 'rows'}:
            note(f'{n} points fit only when each stays on one line; six of two lines')
        for li in (n for n in sec.all() if n.tag == 'li'):
            if sum(1 for a in li.ancestors() if a.tag in ('ul', 'ol')) > 2:
                warn('a third list level: two at most')
                break
    elif layout == 'cards':
        for ul in (n for n in sec.all() if n.tag == 'ul' and 'cards' in n.classes):
            cols = next((int(c[5:]) for c in ul.classes if re.fullmatch(r'cols-[2-5]', c)), 3)
            n = len(ul.items())
            if n > 2 * cols:
                warn(f'{n} cards in {cols} columns: more than two rows; split the slide')
            elif n > cols:
                note(f'{n} cards in {cols} columns make two rows: each card has half the height, keep its text to two lines')
            if n == 1:
                warn('one card: use statement or list instead')
    elif layout == 'steps':
        for ol in (n for n in sec.all() if n.tag == 'ol' and 'flow' in n.classes):
            n = len(ol.items())
            if n > 5:
                warn(f'{n} steps: the row holds five; split the sequence')
            elif n > 3:
                note(f'{n} steps in a row: headings of one or two words, text of two lines')
    elif layout == 'agenda':
        for ol in (n for n in sec.all() if n.tag == 'ol' and 'agenda' in n.classes):
            n = len(ol.items())
            if n > 11:
                warn(f'{n} agenda lines: a slide holds eleven; a second agenda slide follows')
            elif n > 8 and 'many' not in ol.classes:
                warn(f'{n} agenda lines: add class="agenda many" to the list for more than eight')
    elif layout == 'acronym':
        for dl in (n for n in sec.all() if n.tag == 'dl' and 'acronym' in n.classes):
            n = len([c for c in dl.children if isinstance(c, Node) and c.tag == 'div'])
            if n > 7:
                warn(f'{n} letters: seven at most, even compact')
            elif n > 6 and 'compact' not in dl.classes:
                warn(f'{n} letters: use dl.acronym.compact beyond six')
    elif layout == 'exercise':
        for ol in (n for n in sec.all() if n.tag == 'ol' and 'steps' in n.classes):
            n = len(ol.items())
            if n > 8:
                warn(f'{n} steps: eight at most; a second slide for the rest')
            elif n > 5:
                note(f'{n} steps fit only when each stays on one line; five of two lines')
    elif layout == 'canvas':
        n = len([x for x in sec.all() if x.tag == 'div' and 'box' in x.classes])
        if n > 9:
            warn(f'{n} boxes: nine at most')
    elif layout == 'table':
        rows = len([x for x in sec.all() if x.tag == 'tr'])
        compact = any('compact' in x.classes for x in sec.all() if x.tag == 'table')
        if rows > (11 if compact else 10):
            warn(f'{rows} rows with the header: the table holds about ten{"" if compact else ", eleven with table.compact"}')
    elif layout == 'statement':
        for p in (x for x in sec.all() if x.tag == 'p' and 'big' in x.classes):
            w = words(p)
            long = any('long' in a.classes for a in p.ancestors())
            if w > 50:
                warn(f'{w} words: too long for a statement; use list or split')
            elif w > 20 and not long:
                warn(f'{w} words: add class="text long" to the div for more than about fourteen')
            elif w > 14 and not long:
                note(f'{w} words at full size make three or four lines; class="text long" reads easier')
    elif layout == 'quote':
        for bq in (x for x in sec.all() if x.tag == 'blockquote'):
            ps = [c for c in bq.children if isinstance(c, Node) and c.tag == 'p' and 'sub' not in c.classes]
            if ps and words(ps[0]) > 50:
                warn(f'{words(ps[0])} words: a quotation of about forty at most')
    elif layout == 'matrix':
        n = len([x for x in sec.all() if x.tag == 'div' and 'cell' in x.classes])
        if n != 4:
            warn(f'{n} cells: a matrix has four')
    elif layout == 'split':
        if not any(x.tag == 'figure' for x in sec.all()):
            warn('split without a figure: use list')
    elif layout == 'model':
        if not any(x.tag == 'svg' for x in sec.all()):
            warn('model without an svg: use figure for a picture')
    elif layout == 'figure':
        if not any(x.tag == 'img' for x in sec.all()):
            warn('figure without a picture')
    return out


# ---- the static checks ----------------------------------------------------------------------------------------------
ROOT_RE = re.compile(r'^\s*<section\s+class="slide(?:\s+([a-z0-9-]+))?[^"]*"')


def check_static(frag, layouts, known, resolve):
    out = []
    m = ROOT_RE.match(frag)
    layout = m.group(1) if m else ''
    if not m:
        out.append(('error', 'the root is not <section class="slide LAYOUT">; the server would wrap the markup into a list slide'))
    elif layout not in layouts:
        out.append(('error', f'unknown layout "{layout}"; the catalogue has {", ".join(layouts)}'))
    root = parse(frag)
    tops = [c for c in root.children if isinstance(c, Node)]
    if len(tops) != 1 or tops[0].tag != 'section':
        out.append(('error', 'one <section> per file and nothing beside it'))
    sec = tops[0] if tops else root
    unknown = sorted({c for n in [sec, *sec.all()] for c in n.classes if c not in known})
    if unknown:
        out.append(('warning', 'classes the stylesheet does not know: ' + ', '.join(unknown)))
    for img in (n for n in sec.all() if n.tag == 'img'):
        src = img.attrs.get('src') or ''
        if re.fullmatch(r'asset:[0-9a-f]{16,64}', src):
            continue
        if src.startswith('assets/'):
            if not resolve(src[7:]):
                out.append(('error', f'picture not found: {src}'))
            elif not re.search(r'\.(png|jpe?g|webp|gif)$', src, re.I):
                out.append(('error', f'{src}: pictures are raster files (PNG, JPEG, WebP, GIF), never SVG'))
        else:
            out.append(('error', f'a picture source is asset:<hash> or assets/<file>, not "{short(src)}"'))
    for n in sec.all():
        if 'todo' in n.classes:
            out.append(('todo', f'<{n.tag}> {short(n.plain())}'))
    out += fits_checks(layout, sec)
    return layout, out


# ---- rendering -------------------------------------------------------------------------------------------------------
def find_chrome():
    c = os.environ.get('CHROME')
    if c and os.access(c, os.X_OK):
        return c
    found = sorted(glob.glob(os.path.expanduser('~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell')))
    return found[-1] if found else None


def placeholder_png(path, w=960, h=640):
    """A soft grey-blue gradient, the size of a photo, written without any imaging library."""
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            t = (x / w + y / h) / 2
            row += bytes((int(212 - 44 * t), int(220 - 38 * t), int(228 - 30 * t)))
        rows.append(bytes(row))
    chunk = lambda tag, data: struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


# The slide's content ends 60 px above the bottom edge (the footer sits in that margin) and 64 px before the right edge.
PAGE_JS = r'''
document.fonts.ready.then(() => {
  const out = [];
  const label = (el) => {
    const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    return el.tagName.toLowerCase() + cls + (t ? ' „' + t.slice(0, 40) + (t.length > 40 ? '…' : '') + '“' : '');
  };
  const skip = (el) => {
    if (el.closest('footer')) return true;
    for (let n = el; n && !n.classList.contains('slide'); n = n.parentElement) if (getComputedStyle(n).position === 'absolute') return true;
    return false;
  };
  document.querySelectorAll('.slide').forEach((slide) => {
    const r = slide.getBoundingClientRect(), f = [], reported = [];
    const full = slide.classList.contains('full');
    for (const el of slide.querySelectorAll('*')) {
      if (full || skip(el) || reported.some((p) => p.contains(el))) continue;
      if (!(el.textContent || '').trim() && el.tagName !== 'IMG' && el.tagName !== 'svg') continue;
      const b = el.getBoundingClientRect();
      if (!b.width && !b.height) continue;
      const below = Math.round(b.bottom - (r.top + 660)), beyond = Math.round(b.right - (r.left + 1216));
      if (b.bottom > r.top + 721) { f.push({ kind: 'cut', what: label(el), px: Math.round(b.bottom - r.top - 720) }); reported.push(el); }
      else if (below > 2) { f.push({ kind: 'bottom', what: label(el), px: below }); reported.push(el); }
      else if (b.right > r.left + 1281) { f.push({ kind: 'cut-right', what: label(el), px: Math.round(b.right - r.left - 1280) }); reported.push(el); }
      else if (beyond > 2) { f.push({ kind: 'right', what: label(el), px: beyond }); reported.push(el); }
    }
    for (const card of slide.querySelectorAll('ul.cards > li, .matrix .cell, .canvas .box, aside.facts, ol.flow > li, ol.blocks > li')) {
      const c = card.getBoundingClientRect();
      for (const el of card.querySelectorAll('*')) {
        if (!(el.textContent || '').trim() && el.tagName !== 'IMG') continue;
        const b = el.getBoundingClientRect();
        if (b.bottom > c.bottom + 1) { f.push({ kind: 'card', what: label(el), px: Math.round(b.bottom - c.bottom), card: label(card).split(' „')[0] }); break; }
      }
    }
    for (const h of slide.querySelectorAll('h1, h2')) {
      const range = document.createRange(); range.selectNodeContents(h);
      const lines = Math.round(range.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight));
      if (lines > 2) f.push({ kind: 'wrap', what: label(h), lines });
    }
    for (const img of slide.querySelectorAll('img')) if (!img.complete || !img.naturalWidth) f.push({ kind: 'img', what: img.getAttribute('data-src') || img.getAttribute('src') });
    out.push(f);
  });
  document.documentElement.innerHTML = '<head></head><body><pre id="r">' + btoa(unescape(encodeURIComponent(JSON.stringify(out)))) + '</pre></body>';
});
'''


def render(frags, theme, theme_css, chrome, tmp):
    """Renders every (fragment, resolve) pair on one page and returns the page script's findings per fragment."""
    placeholder = os.path.join(tmp, 'placeholder.png')
    placeholder_png(placeholder)

    def prepared(frag, resolve):
        def sub(m):
            src = m.group(1)
            if src.startswith('asset:'):
                return f'src="{furl(placeholder)}" data-src="{src}"'
            if src.startswith('assets/'):
                p = resolve(src[7:])
                return f'src="{furl(p) if p else src}" data-src="{src}"'
            return m.group(0)
        return re.sub(r'src="([^"]*)"', sub, frag)

    links = ''.join(f'<link rel="stylesheet" href="{furl(p)}">' for p in (INTER, MANROPE, NOTO, CSS, theme_css) if p and os.path.exists(p))
    page = f'<!doctype html><html lang="de" data-theme="{theme}"><head><meta charset="utf-8">{links}<style>body{{margin:0;background:#777}}.slide{{margin:0 0 24px}}</style></head><body>' + '\n'.join(prepared(f, r) for f, r in frags) + f'<script>{PAGE_JS}</script></body></html>'
    path = os.path.join(tmp, 'check.html')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(page)
    r = subprocess.run([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=8000', '--window-size=1400,900', '--dump-dom', furl(path)], capture_output=True, text=True)
    m = re.search(r'<pre id="r">([^<]*)</pre>', r.stdout)
    if not m:
        sys.exit('Chromium returned no report' + (f':\n{r.stderr.strip()[-600:]}' if r.stderr.strip() else ''))
    return json.loads(base64.b64decode(m.group(1)).decode('utf-8'))


def render_findings(report):
    out = []
    for f in report:
        k = f['kind']
        if k == 'cut':
            out.append(('error', f'{f["what"]} is cut off: {f["px"]} px below the slide'))
        elif k == 'bottom':
            out.append(('warning', f'{f["what"]} runs {f["px"]} px into the bottom margin'))
        elif k == 'cut-right':
            out.append(('error', f'{f["what"]} is cut off: {f["px"]} px beyond the right edge'))
        elif k == 'right':
            out.append(('warning', f'{f["what"]} runs {f["px"]} px into the right margin'))
        elif k == 'card':
            out.append(('error', f'{f["what"]} leaves its {f["card"]} by {f["px"]} px'))
        elif k == 'wrap':
            out.append(('warning', f'{f["what"]} wraps to {f["lines"]} lines'))
        elif k == 'img':
            out.append(('error', f'picture did not load: {f["what"]}'))
    return out


# ---- main ----------------------------------------------------------------------------------------------------------------
def theme_for(themes_dir, name):
    if not name or name == 'default':
        return 'default', DEFAULT_THEME
    for cand in [os.path.join(themes_dir, name + '.css'), os.path.join(themes_dir, name, 'theme.css')] if themes_dir else []:
        if os.path.exists(cand):
            return name, cand
    print(f'theme "{name}" not found' + (f' in {themes_dir}' if themes_dir else ' (no --themes folder)') + '; checking with the default theme', file=sys.stderr)
    return 'default', DEFAULT_THEME


def resolver(folder):
    """assets/<file> next to the deck, else under the preview root (ROOT/assets when the deck lies in ROOT/decks/<deck>)."""
    root = os.path.dirname(os.path.dirname(folder))

    def resolve(name):
        for p in (os.path.join(folder, 'assets', name), os.path.join(root, 'assets', name)):
            if os.path.isfile(p):
                return p
        return None
    return resolve


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('paths', nargs='+', help='slide fragments (.html) or deck folders')
    ap.add_argument('--themes', help='folder with the installation\'s themes (NAME.css or NAME/theme.css)')
    ap.add_argument('--theme', help='theme name; default: the deck.json\'s, else default')
    ap.add_argument('--no-render', action='store_true', help='skip the Chromium rendering')
    ap.add_argument('--json', action='store_true', help='findings as JSON')
    a = ap.parse_args()

    files = []
    for p in a.paths:
        if os.path.isdir(p):
            files += sorted(glob.glob(os.path.join(p, '*.html')))
        elif p.endswith('.html') and os.path.isfile(p):
            files.append(p)
        else:
            sys.exit(f'{p}: not a slide file or a folder')
    if not files:
        sys.exit('no slide fragments found')
    frags = [(f, open(f, encoding='utf-8').read()) for f in files]
    folder = os.path.dirname(os.path.abspath(files[0]))
    themes_dir = a.themes or (os.path.join(os.path.dirname(os.path.dirname(folder)), 'themes') if os.path.basename(os.path.dirname(folder)) == 'decks' else None)
    theme_name = a.theme
    if not theme_name and os.path.exists(os.path.join(folder, 'deck.json')):
        try:
            theme_name = json.load(open(os.path.join(folder, 'deck.json'), encoding='utf-8')).get('theme')
        except (OSError, ValueError):
            pass
    theme, theme_css = theme_for(themes_dir, theme_name)
    stand_in = lambda frag: re.sub(r'src="assets/[^"]*"', f'src="{STAND_IN}"', frag)
    res = bridge([stand_in(frag) for _, frag in frags])
    known = css_classes(CSS, theme_css) | set(res['layouts'])
    findings = {}
    for (f, frag), clean in zip(frags, res['sanitized']):
        layout, out = check_static(frag, res['layouts'], known, resolver(os.path.dirname(os.path.abspath(f))))
        gone = sanitiser_diff(stand_in(frag), clean)
        if gone:
            out.insert(0, ('error', 'the server would remove: ' + ', '.join(gone)))
        findings[f] = [layout, out]

    if not a.no_render:
        chrome = find_chrome()
        if not chrome:
            print('no headless Chromium found: set CHROME, or pass --no-render', file=sys.stderr)
        else:
            with tempfile.TemporaryDirectory() as tmp:
                report = render([(frag, resolver(os.path.dirname(os.path.abspath(f)))) for f, frag in frags], theme, theme_css, chrome, tmp)
            for (f, _), rep in zip(frags, report):
                findings[f][1] += render_findings(rep)

    if a.json:
        print(json.dumps({f: {'layout': l, 'findings': [{'level': lv, 'message': m} for lv, m in out]} for f, (l, out) in findings.items()}, ensure_ascii=False, indent=1))
    counts = {'error': 0, 'warning': 0, 'todo': 0, 'note': 0}
    for f, (layout, out) in findings.items():
        if not a.json:
            print(f'{os.path.relpath(f)}  {layout or "?"}' + ('' if out else '  ok'))
            for level, msg in out:
                print(f'  {level:<8} {msg}')
        for level, _ in out:
            counts[level] += 1
    summary = f'{len(frags)} slide{"s" if len(frags) != 1 else ""} checked with theme {theme}: {counts["error"]} errors, {counts["warning"]} warnings, {counts["todo"]} todos' + (' (not rendered)' if a.no_render else '')
    print(summary, file=sys.stderr if a.json else sys.stdout)
    sys.exit(1 if counts['error'] else 0)


if __name__ == '__main__':
    main()
