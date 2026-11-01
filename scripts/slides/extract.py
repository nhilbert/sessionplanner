#!/usr/bin/env python3
"""Reads a PowerPoint deck and writes what the slide translation needs (docs/slides.md, section 6):

    extract.py deck.pptx OUTDIR

OUTDIR/deck.json   every slide: layout, background, shapes in z-order with position, fill and text
                   (paragraphs with level, bold, size), pictures, tables, charts, SmartArt texts, notes
OUTDIR/outline.md  one line per slide, for a first read
OUTDIR/media/      the pictures, named by content hash (the SVG of a picture when the deck has one)

Standard library only; nothing is rendered. Positions are inches on the slide."""
import hashlib, json, os, re, sys, zipfile
from xml.etree import ElementTree as ET

NS = {
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'c': 'http://schemas.openxmlformats.org/drawingml/2006/chart',
    'dgm': 'http://schemas.openxmlformats.org/drawingml/2006/diagram',
    'asvg': 'http://schemas.microsoft.com/office/drawing/2016/SVG/main',
}
A = '{%s}' % NS['a']; P = '{%s}' % NS['p']; R = '{%s}' % NS['r']; C = '{%s}' % NS['c']; DGM = '{%s}' % NS['dgm']
EMU = 914400


def rels(z, part):
    d, f = os.path.split(part); p = f'{d}/_rels/{f}.rels'
    out = {}
    if p in z.namelist():
        for r in ET.fromstring(z.read(p)):
            out[r.get('Id')] = (r.get('Type').rsplit('/', 1)[-1], r.get('Target'), r.get('TargetMode'))
    return out


def resolve(base, target):
    return os.path.normpath(os.path.join(os.path.dirname(base), target)).replace('\\', '/')


def inch(v):
    return round(int(v) / EMU, 2)


# ---------- colours ----------
def hex_to_hsl(h):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    mx, mn = max(r, g, b), min(r, g, b); l = (mx + mn) / 2
    if mx == mn: return 0.0, 0.0, l
    d = mx - mn; s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r: hh = (g - b) / d + (6 if g < b else 0)
    elif mx == g: hh = (b - r) / d + 2
    else: hh = (r - g) / d + 4
    return hh / 6, s, l


def hsl_to_hex(h, s, l):
    def f(n):
        k = (n + h * 12) % 12; a = s * min(l, 1 - l)
        return l - a * max(-1, min(k - 3, 9 - k, 1))
    return '#%02X%02X%02X' % tuple(round(max(0, min(1, f(n))) * 255) for n in (0, 8, 4))


class Colours:
    def __init__(self, z, master):
        mrel = rels(z, master)
        theme_part = next((resolve(master, v[1]) for v in mrel.values() if v[0] == 'theme'), None)
        self.scheme = {}; self.fonts = ('', ''); self.name = ''
        if theme_part:
            t = ET.fromstring(z.read(theme_part)); self.name = t.get('name', '')
            cs = t.find('.//a:clrScheme', NS)
            for c in cs:
                s = c.find('a:srgbClr', NS); sy = c.find('a:sysClr', NS)
                self.scheme[c.tag.split('}')[-1]] = '#' + (s.get('val') if s is not None else sy.get('lastClr', '000000'))
            fs = t.find('.//a:fontScheme', NS)
            self.fonts = (fs.find('a:majorFont/a:latin', NS).get('typeface'), fs.find('a:minorFont/a:latin', NS).get('typeface'))
        cm = ET.fromstring(z.read(master)).find('p:clrMap', NS)
        self.map = dict(cm.attrib) if cm is not None else {}

    def of(self, el):
        """Resolves a colour element (solidFill etc.) to #RRGGBB, or None."""
        if el is None: return None
        s = el.find('a:srgbClr', NS); sc = el.find('a:schemeClr', NS); sy = el.find('a:sysClr', NS)
        node = s if s is not None else (sc if sc is not None else sy)
        if node is None: return None
        if node is s: base = '#' + s.get('val')
        elif node is sy: base = '#' + sy.get('lastClr', '000000')
        else:
            key = self.map.get(sc.get('val'), sc.get('val'))
            base = self.scheme.get(key)
            if not base: return None
        h, sa, l = hex_to_hsl(base[1:])
        for m in node:
            tag = m.tag.split('}')[-1]; v = int(m.get('val', '0')) / 100000
            if tag == 'lumMod': l *= v
            elif tag == 'lumOff': l += v
            elif tag == 'satMod': sa *= v
            elif tag == 'tint': l = l * v + (1 - v)
            elif tag == 'shade': l = l * v
        return hsl_to_hex(h, min(1, sa), min(1, max(0, l)))


# ---------- text ----------
def paragraphs(txbody):
    out = []
    if txbody is None: return out
    for p in txbody.findall('a:p', NS):
        ppr = p.find('a:pPr', NS)
        level = int(ppr.get('lvl', '0')) if ppr is not None else 0
        align = ppr.get('algn') if ppr is not None else None
        bullet = None
        if ppr is not None:
            if ppr.find('a:buNone', NS) is not None: bullet = 'none'
            elif ppr.find('a:buAutoNum', NS) is not None: bullet = 'number'
            elif ppr.find('a:buChar', NS) is not None: bullet = 'char'
        text, bolds, sizes = '', [], []
        for child in p:
            tag = child.tag.split('}')[-1]
            if tag in ('r', 'fld'):
                t = child.find('a:t', NS); rpr = child.find('a:rPr', NS)
                s = t.text or '' if t is not None else ''
                text += s
                if s.strip():
                    bolds.append(rpr is not None and rpr.get('b') == '1')
                    if rpr is not None and rpr.get('sz'): sizes.append(int(rpr.get('sz')) / 100)
            elif tag == 'br': text += '\n'
        if not text.strip() and not out: continue
        para = {'text': text.strip(), 'level': level}
        if bolds and all(bolds): para['bold'] = True
        if sizes: para['size'] = max(sizes)
        if align and align != 'l': para['align'] = align
        if bullet: para['bullet'] = bullet
        out.append(para)
    while out and not out[-1]['text']: out.pop()
    return out


# ---------- shapes ----------
class Extractor:
    def __init__(self, z, outdir):
        self.z, self.outdir = z, outdir
        self.media = {}  # part name -> saved file
        os.makedirs(os.path.join(outdir, 'media'), exist_ok=True)

    def save_media(self, part):
        if part in self.media: return self.media[part]
        if part not in self.z.namelist(): return None
        data = self.z.read(part); ext = part.rsplit('.', 1)[-1].lower()
        name = f'{hashlib.sha256(data).hexdigest()[:16]}.{ext}'
        path = os.path.join(self.outdir, 'media', name)
        if not os.path.exists(path): open(path, 'wb').write(data)
        self.media[part] = {'file': 'media/' + name, 'bytes': len(data)}
        return self.media[part]

    def xfrm(self, el, tf):
        """Position of a shape in inches after the group transforms tf (list of (off, ext, chOff, chExt))."""
        x = el.find('./*/a:xfrm', NS)
        if x is None: x = el.find('./p:xfrm', NS)
        if x is None: return None
        off, ext = x.find('a:off', NS), x.find('a:ext', NS)
        if off is None or ext is None or off.get('x') is None: return None
        X, Y, W, H = int(off.get('x')), int(off.get('y')), int(ext.get('cx')), int(ext.get('cy'))
        for (ox, oy, ex, ey, cx, cy, cw, ch) in reversed(tf):
            sx = ex / cw if cw else 1; sy = ey / ch if ch else 1
            X = ox + (X - cx) * sx; Y = oy + (Y - cy) * sy; W *= sx; H *= sy
        box = {'x': round(X / EMU, 2), 'y': round(Y / EMU, 2), 'w': round(W / EMU, 2), 'h': round(H / EMU, 2)}
        if x.get('rot'): box['rot'] = int(x.get('rot')) / 60000
        return box

    def walk(self, tree, part, srel, colours, tf, out):
        for el in tree:
            tag = el.tag.split('}')[-1]
            if tag == 'grpSp':
                x = el.find('p:grpSpPr/a:xfrm', NS)
                sub = list(tf)
                if x is not None and x.find('a:off', NS) is not None and x.find('a:chOff', NS) is not None:
                    o, e, co, ce = (x.find(f'a:{k}', NS) for k in ('off', 'ext', 'chOff', 'chExt'))
                    sub.append((int(o.get('x')), int(o.get('y')), int(e.get('cx')), int(e.get('cy')), int(co.get('x')), int(co.get('y')), int(ce.get('cx')), int(ce.get('cy'))))
                self.walk(el, part, srel, colours, sub, out)
                continue
            if tag not in ('sp', 'pic', 'graphicFrame', 'cxnSp'): continue
            cnv = el.find('.//p:cNvPr', NS)
            shape = {'kind': {'sp': 'shape', 'pic': 'picture', 'graphicFrame': 'frame', 'cxnSp': 'line'}[tag], 'name': cnv.get('name', '') if cnv is not None else ''}
            ph = el.find('.//p:nvPr/p:ph', NS)
            if ph is not None: shape['placeholder'] = ph.get('type', 'body')
            box = self.xfrm(el, tf)
            if box: shape['box'] = box
            spPr = el.find('p:spPr', NS)
            if spPr is not None:
                geom = spPr.find('a:prstGeom', NS)
                if geom is not None and geom.get('prst') not in ('rect', None): shape['geometry'] = geom.get('prst')
                fill = colours.of(spPr.find('a:solidFill', NS))
                if fill: shape['fill'] = fill
                ln = spPr.find('a:ln', NS)
                if ln is not None and ln.find('a:solidFill', NS) is not None: shape['line'] = colours.of(ln.find('a:solidFill', NS))
            if tag == 'sp':
                paras = paragraphs(el.find('p:txBody', NS))
                if paras:
                    shape['text'] = paras
                    rpr = el.find('.//a:rPr/a:solidFill', NS)
                    if rpr is not None: shape['color'] = colours.of(rpr)
                if not paras and not shape.get('fill') and not shape.get('geometry'): continue
                shape['kind'] = 'text' if paras and not shape.get('fill') else shape['kind']
            elif tag == 'pic':
                blip = el.find('.//a:blip', NS)
                if blip is not None:
                    svg = blip.find('.//asvg:svgBlip', NS)
                    rid = svg.get(R + 'embed') if svg is not None else blip.get(R + 'embed')
                    if rid in srel:
                        m = self.save_media(resolve(part, srel[rid][1]))
                        if m: shape.update(m)
                descr = cnv.get('descr') if cnv is not None else None
                if descr: shape['alt'] = descr
            elif tag == 'graphicFrame':
                g = el.find('.//a:graphic/a:graphicData', NS)
                uri = g.get('uri', '').rsplit('/', 1)[-1] if g is not None else ''
                if uri == 'table':
                    shape['kind'] = 'table'
                    shape['rows'] = [[' '.join(p['text'] for p in paragraphs(tc.find('a:txBody', NS))) for tc in tr.findall('a:tc', NS)] for tr in g.iter(A + 'tr')]
                elif uri == 'chart':
                    shape['kind'] = 'chart'; shape.update(self.chart(g, part, srel))
                elif uri == 'diagram':
                    shape['kind'] = 'smartart'; shape['items'] = self.diagram(g, part, srel)
                else:
                    shape['kind'] = uri or 'frame'
            out.append(shape)

    def chart(self, g, part, srel):
        ref = g.find('c:chart', NS)
        out = {}
        if ref is None or ref.get(R + 'id') not in srel: return out
        cpart = resolve(part, srel[ref.get(R + 'id')][1])
        try: root = ET.fromstring(self.z.read(cpart))
        except KeyError: return out
        title = root.find('.//c:title', NS)
        if title is not None: out['title'] = ' '.join(t.text or '' for t in title.iter(A + 't')).strip()
        plot = root.find('.//c:plotArea', NS)
        if plot is not None:
            out['type'] = [c.tag.split('}')[-1] for c in plot if c.tag.endswith('Chart')]
        series = []
        for ser in root.iter(C + 'ser'):
            s = {}
            tx = ser.find('c:tx', NS)
            if tx is not None: s['name'] = ' '.join(v.text or '' for v in tx.iter(C + 'v')).strip()
            cat = ser.find('c:cat', NS)
            if cat is not None: s['categories'] = [v.text for v in cat.iter(C + 'v')]
            val = ser.find('c:val', NS)
            if val is not None: s['values'] = [v.text for v in val.iter(C + 'v')]
            series.append(s)
        if series: out['series'] = series
        return out

    def diagram(self, g, part, srel):
        ids = g.find('dgm:relIds', NS)
        if ids is None or ids.get(R + 'dm') not in srel: return []
        dpart = resolve(part, srel[ids.get(R + 'dm')][1])
        try: root = ET.fromstring(self.z.read(dpart))
        except KeyError: return []
        items = []
        for pt in root.iter(DGM + 'pt'):
            if pt.get('type') in ('doc', 'pres', 'parTrans', 'sibTrans'): continue
            paras = paragraphs(pt.find('dgm:t', NS))
            text = ' / '.join(p['text'] for p in paras if p['text'])
            if text: items.append(text)
        return items


def main(src, outdir):
    z = zipfile.ZipFile(src)
    os.makedirs(outdir, exist_ok=True)
    pres = ET.fromstring(z.read('ppt/presentation.xml'))
    sz = pres.find('p:sldSz', NS)
    prel = rels(z, 'ppt/presentation.xml')
    slides = []
    for s in pres.find('p:sldIdLst', NS):
        slides.append((resolve('ppt/presentation.xml', prel[s.get(R + 'id')][1]), s))
    ex = Extractor(z, outdir)
    masters_colours = {}
    deck = {'source': os.path.basename(src), 'size': [inch(sz.get('cx')), inch(sz.get('cy'))], 'slides': []}
    lines = [f'# {os.path.basename(src)}', '']
    for n, (part, sid) in enumerate(slides, 1):
        xml = z.read(part); root = ET.fromstring(xml); srel = rels(z, part)
        layout = next((resolve(part, v[1]) for v in srel.values() if v[0] == 'slideLayout'), None)
        lroot = ET.fromstring(z.read(layout)) if layout else None
        master = next((resolve(layout, v[1]) for v in rels(z, layout).values() if v[0] == 'slideMaster'), None) if layout else None
        if master not in masters_colours: masters_colours[master] = Colours(z, master)
        colours = masters_colours[master]
        if 'theme' not in deck:
            deck['theme'] = {'name': colours.name, 'fonts': colours.fonts, 'colours': colours.scheme}
        # background: slide, else layout, else master
        bg = None
        for node in (root, lroot, ET.fromstring(z.read(master))):
            if node is None: continue
            b = node.find('.//p:bg//a:solidFill', NS)
            if b is not None: bg = colours.of(b); break
        slide = {'n': n, 'layout': lroot.find('p:cSld', NS).get('name') if lroot is not None else None, 'background': bg, 'shapes': []}
        if root.get('show') == '0': slide['hidden'] = True
        ex.walk(root.find('.//p:spTree', NS), part, srel, colours, [], slide['shapes'])
        notes = next((resolve(part, v[1]) for v in srel.values() if v[0] == 'notesSlide'), None)
        if notes:
            ntext = [p['text'] for sp in ET.fromstring(z.read(notes)).iter(P + 'sp') if sp.find('.//p:ph', NS) is not None and sp.find('.//p:ph', NS).get('type') == 'body' for p in paragraphs(sp.find('p:txBody', NS)) if p['text']]
            if ntext: slide['notes'] = '\n'.join(ntext)
        title = next((' '.join(p['text'] for p in s['text']) for s in slide['shapes'] if s.get('placeholder') in ('title', 'ctrTitle') and s.get('text')), '')
        if not title:
            texts = [s for s in slide['shapes'] if s.get('text')]
            if texts: title = ' '.join(p['text'] for p in max(texts, key=lambda s: max(p.get('size', 0) for p in s['text']))['text'])
        slide['title'] = title
        deck['slides'].append(slide)
        kinds = {}
        for s in slide['shapes']: kinds[s['kind']] = kinds.get(s['kind'], 0) + 1
        body = ' | '.join(p['text'] for s in slide['shapes'] if s.get('text') and s.get('placeholder') not in ('title', 'ctrTitle') for p in s['text'] if p['text'])
        lines.append(f'{n:3}. [{slide["layout"]}] {title[:60]}  ·  {", ".join(f"{v} {k}" for k, v in kinds.items())}{"  ·  notes" if slide.get("notes") else ""}{"  ·  HIDDEN" if slide.get("hidden") else ""}\n     {body[:220]}')
    json.dump(deck, open(os.path.join(outdir, 'deck.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    open(os.path.join(outdir, 'outline.md'), 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'{len(deck["slides"])} slides, {len(ex.media)} media files -> {outdir}')


if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
