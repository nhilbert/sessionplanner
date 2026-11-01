#!/usr/bin/env python3
"""Builds the static slide preview of a deck folder (docs/slides.md, section 6):

    build.py ROOT

ROOT/decks/<deck>/deck.json   title, theme, chrome (footer text), optional entries (the cut into library entries)
ROOT/decks/<deck>/NN-*.html   one slide per file
ROOT/themes/<theme>.css       the installation's themes (fonts and logos next to them); the neutral default
                              theme comes from this folder

Writes ROOT/format/ (stylesheets copied from here), ROOT/<deck>.html (grid, click to present, ← → to page,
?only=N for one slide at 1280×720, ?sheet=K for a contact sheet of six) and ROOT/index.html."""
import html, json, os, re, shutil, sys

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
decks_dir = os.path.join(root, 'decks')
fmt = os.path.join(root, 'format'); os.makedirs(os.path.join(fmt, 'themes'), exist_ok=True)
for f in ('slides.css', 'preview.css'): shutil.copy(os.path.join(here, f), fmt)
shutil.copy(os.path.join(here, 'themes', 'default.css'), os.path.join(fmt, 'themes'))

JS = r'''
(function () {
  const q = new URLSearchParams(location.search);
  const frames = [...document.querySelectorAll('.frame')];
  function fit() { frames.forEach(f => f.style.setProperty('--s', f.clientWidth / 1280)); }
  const only = q.get('only'), sheet = q.get('sheet');
  if (only) {
    document.body.classList.add('only');
    const single = document.createElement('div'); single.className = 'single';
    single.appendChild(frames[parseInt(only, 10) - 1].querySelector('.slide').cloneNode(true));
    document.body.appendChild(single); return;
  }
  if (sheet !== null) {
    document.body.classList.add('sheet');
    const k = parseInt(sheet, 10), per = 6;
    document.querySelectorAll('h2.entry').forEach(h => h.remove());
    document.querySelectorAll('.item').forEach((it, i) => { if (i < k * per || i >= (k + 1) * per) it.remove(); });
    fit(); return;
  }
  fit(); new ResizeObserver(fit).observe(document.body);
  const overlay = document.querySelector('.overlay'), stage = overlay.querySelector('.stage');
  let cur = -1;
  function show(i) {
    if (i < 0 || i >= frames.length) return;
    cur = i; stage.innerHTML = ''; stage.appendChild(frames[i].querySelector('.slide').cloneNode(true));
    overlay.classList.add('open'); scale();
  }
  function scale() { stage.style.transform = 'scale(' + Math.min(innerWidth / 1280, innerHeight / 720) + ')'; }
  function hide() { overlay.classList.remove('open'); cur = -1; }
  frames.forEach((f, i) => f.addEventListener('click', () => show(i)));
  overlay.addEventListener('click', hide);
  addEventListener('resize', scale);
  addEventListener('keydown', e => {
    if (cur < 0) return;
    if (e.key === 'Escape') hide();
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); show(Math.min(cur + 1, frames.length - 1)); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); show(Math.max(cur - 1, 0)); }
  });
})();
'''


def theme_href(theme):
    return f'themes/{theme}.css' if os.path.exists(os.path.join(root, 'themes', theme + '.css')) else f'format/themes/{theme}.css'


index = []
for deck in sorted(os.listdir(decks_dir)) if os.path.isdir(decks_dir) else []:
    d = os.path.join(decks_dir, deck)
    if not os.path.isdir(d) or not os.path.exists(os.path.join(d, 'deck.json')): continue
    meta = json.load(open(os.path.join(d, 'deck.json'), encoding='utf-8'))
    files = sorted(f for f in os.listdir(d) if f.endswith('.html'))
    chrome = html.escape(meta.get('chrome', meta['title']))
    # the grid keeps the deck's order; a heading marks where a library entry starts
    entries = meta.get('entries') or []
    starts = {e['slides'][0]: e for e in entries if e.get('slides')}
    unassigned = meta.get('unassigned') or {}
    items, n = [], 0
    for f in files:
        n += 1
        if f in starts:
            entry = starts[f]
            facts = ' · '.join(str(entry[k]) for k in ('kind', 'category', 'duration') if entry.get(k))
            items.append(f'<h2 class="entry">{html.escape(entry["title"])}<small>{html.escape(facts)}</small></h2>')
        elif entries and f in unassigned:
            items.append(f'<h2 class="entry muted">{html.escape(unassigned[f])}</h2>')
        frag = open(os.path.join(d, f), encoding='utf-8').read().strip()
        m = re.search(r'<section class="slide ([^"]*)"', frag)
        layout = m.group(1) if m else '?'
        todo = ' <em>todo</em>' if 'class="todo"' in frag or ' todo"' in frag else ''
        frag = frag[:frag.rfind('</section>')] + f'<footer class="chrome"><span>{chrome}</span><span>{n}</span></footer></section>'
        items.append(f'<div class="item"><div class="frame" data-n="{n}">{frag}</div><div class="cap"><b>{n:02d}</b><span>{html.escape(f)}</span><span>{html.escape(layout)}</span>{todo}</div></div>')
    page = f'''<!doctype html>
<html lang="de" data-theme="{meta["theme"]}"><head><meta charset="utf-8"><title>{html.escape(meta["title"])}</title>
<link rel="stylesheet" href="format/slides.css"><link rel="stylesheet" href="{theme_href(meta["theme"])}"><link rel="stylesheet" href="format/preview.css"></head>
<body><div class="top"><a href="index.html">← Decks</a><h1>{html.escape(meta["title"])}</h1><span>{n} Folien · Theme {meta["theme"]}</span><span class="hint">Klick auf eine Folie zeigt sie groß · ← → blättern · Esc schließt</span></div>
<main class="grid">{"".join(items)}</main>
<div class="overlay"><div class="stage"></div></div>
<script>{JS}</script></body></html>'''
    open(os.path.join(root, deck + '.html'), 'w', encoding='utf-8').write(page)
    index.append(f'<li><a href="{deck}.html">{html.escape(meta["title"])}</a><div class="meta">{n} Folien · Theme {meta["theme"]}{f" · {len(entries)} Bibliothekseinträge" if entries else ""}</div></li>')
    print(f'{deck}.html: {n} slides ({meta["theme"]}){f", {len(entries)} entries" if entries else ""}')
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(f'''<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Folien-Vorschau</title><link rel="stylesheet" href="format/preview.css"></head>
<body><div class="top"><h1>Folien-Vorschau</h1></div><ul class="decks">{"".join(index)}</ul></body></html>''')
