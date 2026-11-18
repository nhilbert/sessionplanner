"""Shared by build.py and check.py: the domain module run by node, the fonts, a sheet's files and its theme."""
import hashlib, json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
LATO_CSS = ('300.css', '400.css', '400-italic.css', '700.css', '900.css')
FONTS = (('@fontsource-variable/inter', 'index.css', '-wght-normal.woff2'), ('@fontsource-variable/manrope', 'index.css', '-wght-normal.woff2'), ('@fontsource/lato', LATO_CSS, None))

BRIDGE = r'''
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const repo = process.env.SP_REPO
const { normalizeSheetHtml, SHEET_BLOCK_NAMES } = await import(pathToFileURL(repo + '/src/domain/sheets.ts').href)
const pages = JSON.parse(readFileSync(0, 'utf8'))
process.stdout.write(JSON.stringify({ blocks: SHEET_BLOCK_NAMES, pages: pages.map((h) => normalizeSheetHtml(h)) }))
'''


def bridge(pages):
    """The block names of the catalogue and every page as the app would store it."""
    r = subprocess.run(['node', '--no-warnings', '--input-type=module', '-e', BRIDGE], input=json.dumps(pages), capture_output=True, text=True, env={**os.environ, 'SP_REPO': REPO})
    if r.returncode:
        sys.exit(f'node could not run the domain module (node 22.6 or newer, run from the repository):\n{r.stderr.strip()}')
    return json.loads(r.stdout)


def stand_in(path):
    """asset:<hash> standing in for assets/<file> while the sanitiser runs (it keeps asset references only)."""
    return 'asset:' + hashlib.sha256(path.encode()).hexdigest()


def normalize_pages(pages, with_blocks=False):
    """The pages as stored, with assets/<file> kept as written."""
    names = {}
    def swap(m):
        names[stand_in(m.group(1))] = m.group(1)
        return f'src="{stand_in(m.group(1))}"'
    out = bridge([re.sub(r'src="(assets/[^"]+)"', swap, p) for p in pages])
    back = [re.sub(r'src="(asset:[0-9a-f]{64})"', lambda m: f'src="{names.get(m.group(1), m.group(1))}"', p) for p in out['pages']]
    return (back, out['blocks']) if with_blocks else back


def copy_fonts(fmt):
    for pkg, css, suffix in FONTS:
        src = os.path.join(REPO, 'node_modules', pkg)
        if not os.path.isdir(src): continue
        dst = os.path.join(fmt, pkg.split('/')[-1]); os.makedirs(os.path.join(dst, 'files'), exist_ok=True)
        for c in ((css,) if isinstance(css, str) else css): shutil.copy(os.path.join(src, c), os.path.join(dst, c))
        for f in os.listdir(os.path.join(src, 'files')):
            keep = re.search(r'-(300|400|700|900)-(normal|italic)\.woff2$', f) is not None if suffix is None else f.endswith(suffix)
            if keep: shutil.copy(os.path.join(src, 'files', f), os.path.join(dst, 'files', f))


def font_links(prefix='format/'):
    lato = ''.join(f'<link rel="stylesheet" href="{prefix}lato/{c}">' for c in LATO_CSS)
    return f'<link rel="stylesheet" href="{prefix}inter/index.css"><link rel="stylesheet" href="{prefix}manrope/index.css">{lato}'


def sheet_meta(folder):
    meta = json.load(open(os.path.join(folder, 'sheet.json'), encoding='utf-8'))
    meta['theme'] = str(meta.get('theme') or 'default').strip().lower()
    meta['paper'] = str(meta.get('paper') or 'A4').upper()
    meta['duplex'] = bool(meta.get('duplex'))
    return meta


def sheet_pages(folder):
    return sorted(f for f in os.listdir(folder) if f.endswith('.html'))


def theme_paper(root, theme):
    """Where the theme puts its logo on paper; the logo's path relative to ROOT."""
    p = os.path.join(root, 'themes', theme, 'paper.json')
    paper = json.load(open(p, encoding='utf-8')) if os.path.exists(p) else {}
    if paper.get('logo'): paper['logo'] = f'themes/{theme}/{paper["logo"]}'
    return paper
