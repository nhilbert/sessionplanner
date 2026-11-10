import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeSlideHtml, slideTitle } from '@/domain/slides'
import { SLIDE_LAYOUTS } from '@/domain/slideFormat'
import { importDeck } from '../importDeck'
import { deckFromPptx, type PptxImport } from './read'
import { BadXml, descendants, MAX_XML_DEPTH, parseXml } from './xml'
import { zip, type ZipEntry } from './zip'

const api = vi.hoisted(() => ({ uploadAsset: vi.fn(), createDeck: vi.fn(), saveLibraryEntry: vi.fn() }))
vi.mock('@/api', () => ({ api }))

// ---- a small PowerPoint file, written by hand, with fictional content ------------------------------------------------

const NS = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const W = 12192000
const H = 6858000

const xmlText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const xfrm = (x: number, y: number, w: number, h: number) => `<a:xfrm><a:off x="${Math.round(x * W)}" y="${Math.round(y * H)}"/><a:ext cx="${Math.round(w * W)}" cy="${Math.round(h * H)}"/></a:xfrm>`

interface P {
  t: string
  lvl?: number
  b?: boolean
  sz?: number
  num?: boolean
  none?: boolean
}
const para = (p: string | P): string => {
  const { t, lvl, b, sz, num, none } = typeof p === 'string' ? ({ t: p } as P) : p
  const props = `${lvl ? ` lvl="${lvl}"` : ''}`
  const bullet = num ? '<a:buAutoNum type="arabicPeriod"/>' : none ? '<a:buNone/>' : ''
  return `<a:p><a:pPr${props}>${bullet}</a:pPr><a:r><a:rPr${b ? ' b="1"' : ''}${sz ? ` sz="${sz * 100}"` : ''}/><a:t>${xmlText(t)}</a:t></a:r></a:p>`
}
const txBody = (paras: (string | P)[]) => `<p:txBody><a:bodyPr/>${paras.map(para).join('')}</p:txBody>`

const placeholder = (attrs: string, paras: (string | P)[], box = '') => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr><p:ph ${attrs}/></p:nvPr></p:nvSpPr><p:spPr>${box}</p:spPr>${txBody(paras)}</p:sp>`
const title = (text: string) => placeholder('type="title"', [text])
const subtitle = (text: string) => placeholder('type="subTitle" idx="1"', [text])
const body = (...paras: (string | P)[]) => placeholder('idx="1"', paras)
const textBox = (x: number, y: number, w: number, h: number, ...paras: (string | P)[]) => `<p:sp><p:nvSpPr><p:cNvPr id="3" name="t"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"/><a:noFill/></p:spPr>${txBody(paras)}</p:sp>`
const filled = (x: number, y: number, w: number, h: number, prst = 'rect') => `<p:sp><p:nvSpPr><p:cNvPr id="4" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="${prst}"/><a:solidFill><a:srgbClr val="DDEEFF"/></a:solidFill></p:spPr></p:sp>`
const labelled = (x: number, y: number, w: number, h: number, text: string, colour = 'CCDDEE') => `<p:sp><p:nvSpPr><p:cNvPr id="7" name="l"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, y, w, h)}<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="${colour}"/></a:solidFill></p:spPr>${txBody([text])}</p:sp>`
const picture = (rid: string, x: number, y: number, w: number, h: number, descr = '') => `<p:pic><p:nvPicPr><p:cNvPr id="5" name="p" descr="${descr}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/></p:blipFill><p:spPr>${xfrm(x, y, w, h)}</p:spPr></p:pic>`

const cell = (t: string, attrs = '') => `<a:tc${attrs}>${t ? `<a:txBody><a:bodyPr/><a:p><a:r><a:t>${xmlText(t)}</a:t></a:r></a:p></a:txBody>` : '<a:txBody><a:bodyPr/><a:p/></a:txBody>'}<a:tcPr/></a:tc>`
const row = (...cells: string[]) => `<a:tr h="370840">${cells.join('')}</a:tr>`
const table = (props: string, ...rows: string[]) => `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="tb"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="600000" y="1600000"/><a:ext cx="9000000" cy="3000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr ${props}/><a:tblGrid/>${rows.join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`

const png = (seed = 1, size = 64) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, ...new Array(size).fill(seed)])
const jpeg = (seed = 2) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, seed, 0, 0, 0, 0])
const emf = new Uint8Array([1, 0, 0, 0, 0x6c, 0, 0, 0, 0, 0, 0, 0])

interface TestSlide {
  shapes: string
  /** Relationships of the slide by id: an image in the package, or anything else as [type, target, mode]. */
  images?: Record<string, string>
  rels?: [string, string, string, string?][]
  notes?: string
  hidden?: boolean
  bg?: string
}

const relationships = (rels: [string, string, string, string?][]) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map(([id, type, target, mode]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"${mode ? ` TargetMode="${mode}"` : ''}/>`).join('')}</Relationships>`

const LAYOUT = `<p:sldLayout ${NS}><p:cSld name="L"><p:spTree>
  ${placeholder('type="title"', ['Text of the layout'], xfrm(0.05, 0.05, 0.9, 0.15))}
  ${placeholder('idx="1"', ['Prompt of the layout'], xfrm(0.05, 0.25, 0.9, 0.65))}
  ${placeholder('type="body" idx="2"', ['Left'], xfrm(0.05, 0.25, 0.42, 0.65))}
  ${placeholder('type="body" idx="3"', ['Right'], xfrm(0.53, 0.25, 0.42, 0.65))}
  ${textBox(0.1, 0.1, 0.2, 0.1, 'Decoration of the layout')}
</p:spTree></p:cSld></p:sldLayout>`

async function pptxEntries(slides: TestSlide[], media: Record<string, Uint8Array> = {}, order?: number[], extra: ZipEntry[] = []): Promise<ZipEntry[]> {
  const entries: ZipEntry[] = [
    { path: '_rels/.rels', data: relationships([['rId1', `${REL}/officeDocument`, 'ppt/presentation.xml']]) },
    { path: 'ppt/slideLayouts/slideLayout1.xml', data: LAYOUT },
  ]
  const indices = order ?? slides.map((_, i) => i)
  entries.push({ path: 'ppt/presentation.xml', data: `<p:presentation ${NS}><p:sldIdLst>${indices.map((i, n) => `<p:sldId id="${256 + n}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${W}" cy="${H}"/></p:presentation>` })
  entries.push({ path: 'ppt/_rels/presentation.xml.rels', data: relationships(slides.map((_, i) => [`rId${i + 1}`, `${REL}/slide`, `slides/slide${i + 1}.xml`])) })
  slides.forEach((s, i) => {
    const n = i + 1
    entries.push({ path: `ppt/slides/slide${n}.xml`, data: `<p:sld ${NS}${s.hidden ? ' show="0"' : ''}><p:cSld>${s.bg ?? ''}<p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${s.shapes}</p:spTree></p:cSld></p:sld>` })
    const rels: [string, string, string, string?][] = [['rL', `${REL}/slideLayout`, '../slideLayouts/slideLayout1.xml'], ...Object.entries(s.images ?? {}).map(([id, target]): [string, string, string] => [id, `${REL}/image`, `../media/${target}`]), ...(s.rels ?? [])]
    if (s.notes !== undefined) {
      rels.push(['rN', `${REL}/notesSlide`, `../notesSlides/notesSlide${n}.xml`])
      entries.push({ path: `ppt/notesSlides/notesSlide${n}.xml`, data: `<p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>${placeholder('type="sldImg"', [])}${placeholder('type="body" idx="1"', s.notes.split('\n'))}${placeholder('type="sldNum" sz="quarter" idx="5"', ['3'])}</p:spTree></p:cSld></p:notes>` })
    }
    entries.push({ path: `ppt/slides/_rels/slide${n}.xml.rels`, data: relationships(rels) })
  })
  for (const [name, data] of Object.entries(media)) entries.push({ path: `ppt/media/${name}`, data, compress: false })
  return [...entries, ...extra]
}

const asFile = (bytes: Uint8Array, name = 'Beispieldeck.pptx') => new File([bytes as BlobPart], name)

async function read(slides: TestSlide[], media: Record<string, Uint8Array> = {}, order?: number[], extra: ZipEntry[] = []): Promise<PptxImport & { html: string[] }> {
  const result = await deckFromPptx(asFile(await zip(await pptxEntries(slides, media, order, extra))))
  const html = await Promise.all(result.found.fragments.map((f) => f.text()))
  html.forEach(expectValid)
  return { ...result, html }
}

const STAND_IN = `asset:${'0'.repeat(64)}`
const LAYOUTS = new Set(SLIDE_LAYOUTS.map((l) => l.layout))

/** What every slide owes the format: a layout of the catalogue, nothing the sanitiser would change, nothing empty. */
function expectValid(html: string) {
  const stored = html.replace(/src="assets\/[^"]+"/g, `src="${STAND_IN}"`)
  expect(normalizeSlideHtml(stored)).toBe(stored)
  expect(LAYOUTS.has(/^<section class="slide ([a-z]+)/.exec(html)?.[1] ?? '')).toBe(true)
  expect(html).not.toContain('{{')
  expect(html).not.toMatch(/<(h1|h2|h3|li|p)[^>]*>\s*<\/\1>/)
}

const layoutOf = (html: string) => /^<section class="slide ([a-z]+)/.exec(html)?.[1]

// ---- the mapping -----------------------------------------------------------------------------------------------------

describe('deckFromPptx, the mapping', () => {
  it('reads a title with bullets as a list, on two levels, in their order', async () => {
    const { html, slides, found } = await read([{ shapes: title('Regeln für heute.') + body('Ausreden lassen', 'Ich-Botschaften', { t: 'Statt Vorwürfen', lvl: 1 }, { t: 'Noch tiefer', lvl: 2 }, 'Pause einhalten') }])
    expect(slides).toBe(1)
    expect(found.fragments[0].name).toBe('001-list.html')
    expect(html[0]).toBe('<section class="slide list"><header><h2>Regeln für heute</h2></header><ul class="list"><li>Ausreden lassen</li><li>Ich-Botschaften<ul><li>Statt Vorwürfen</li><li>Noch tiefer</li></ul></li><li>Pause einhalten</li></ul></section>')
  })

  it('numbers a numbered list and keeps emphasis inside a point', async () => {
    const run = (t: string, b = false) => `<a:r><a:rPr${b ? ' b="1"' : ''}/><a:t>${t}</a:t></a:r>`
    const p = `<a:p><a:pPr><a:buAutoNum type="arabicPeriod"/></a:pPr>${run('Erst ')}${run('sammeln', true)}<a:br/>${run('dann ordnen')}</a:p>`
    const { html } = await read([{ shapes: title('Ablauf') + `<p:sp><p:nvSpPr><p:cNvPr id="2" name="b"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${p}${para({ t: 'Abschluss', num: true })}</p:txBody></p:sp>` }])
    expect(html[0]).toContain('<ol class="list"><li>Erst <strong>sammeln</strong><br>dann ordnen</li><li>Abschluss</li></ol>')
  })

  it('splits what does not fit into several slides, losing nothing and keeping the order', async () => {
    const points = Array.from({ length: 23 }, (_, i) => `Punkt ${i + 1} mit einem Satz, der lang genug ist, um auf einer Folie zwei Zeilen einzunehmen und mehr`)
    const { html, warnings } = await read([{ shapes: title('Viele Punkte') + body(...points) }])
    expect(html.length).toBeGreaterThan(2)
    expect(html.every((h) => layoutOf(h) === 'list' && h.includes('<h2>Viele Punkte</h2>'))).toBe(true)
    expect(html.every((h) => (h.match(/<li>/g) ?? []).length <= 10)).toBe(true)
    const found = html.flatMap((h) => [...h.matchAll(/<li>Punkt (\d+)/g)].map((m) => Number(m[1])))
    expect(found).toEqual(points.map((_, i) => i + 1))
    expect(warnings).toEqual([])
  })

  it('makes the type smaller before splitting, and sets a long list of words in two columns', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => `Ein Punkt mit einigen Wörtern, der noch auf eine Zeile passt, Nummer ${i}`)
    const words = Array.from({ length: 30 }, (_, i) => `Wert ${i}`)
    const { html } = await read([{ shapes: title('Kompakt') + body(...twelve) }, { shapes: title('Werte') + body(...words) }])
    expect(html[0]).toContain('<ul class="list compact">')
    expect(html.slice(1).length).toBe(2)
    expect(html[1]).toContain('<ul class="list two">')
  })

  it('warns when a single point is more than a slide holds', async () => {
    const { html, warnings } = await read([{ shapes: title('Eine Wand') + body('Text '.repeat(900), 'Noch ein Punkt') }])
    expect(html.some((h) => h.includes('Noch ein Punkt'))).toBe(true)
    expect(warnings).toEqual([{ slide: 1, what: 'more text than a slide holds' }])
  })

  it('puts a title, a body and one picture into a split, the picture on its side', async () => {
    const { html, found } = await read(
      [
        { shapes: title('Was ich sehe') + body('Öffentlich', 'Privat') + picture('rI', 0.55, 0.2, 0.4, 0.7, 'Vier Felder'), images: { rI: 'image1.png' } },
        { shapes: title('Ein Foto') + body('Erster Punkt, der etwas länger ist und mehr als nur ein paar Wörter hat', 'Zweiter Punkt') + picture('rI', 0.03, 0.2, 0.4, 0.7), images: { rI: 'image2.jpeg' } },
      ],
      { 'image1.png': png(), 'image2.jpeg': jpeg() },
    )
    expect(html[0]).toMatch(/^<section class="slide split"><header><h2>Was ich sehe<\/h2><\/header><div class="split contain"><div class="text"><ul class="list"><li>Öffentlich<\/li><li>Privat<\/li><\/ul><\/div><figure><img src="assets\/pic-[0-9a-f]+-[0-9a-f]+\.png" alt="Vier Felder"><\/figure><\/div><\/section>$/)
    expect(html[1]).toContain('<div class="split figure-left">')
    const asset = /src="assets\/([^"]+)"/.exec(html[0])![1]
    const file = found.all.get(`assets/${asset}`)!
    expect(file.type).toBe('image/png')
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(png())
  })

  it('lets what the text column does not hold follow as a list', async () => {
    const points = Array.from({ length: 16 }, (_, i) => `Punkt ${i + 1} mit einem Satz, der in der schmalen Spalte zwei Zeilen braucht`)
    const { html } = await read([{ shapes: title('Lang') + body(...points) + picture('rI', 0.55, 0.2, 0.4, 0.7), images: { rI: 'a.png' } }], { 'a.png': png() })
    expect(layoutOf(html[0])).toBe('split')
    expect(html.slice(1).every((h) => layoutOf(h) === 'list')).toBe(true)
    expect(html.flatMap((h) => [...h.matchAll(/<li>Punkt (\d+)/g)].map((m) => Number(m[1])))).toEqual(points.map((_, i) => i + 1))
  })

  it('makes one picture with little text a figure: the title as heading, the text as caption', async () => {
    const { html } = await read(
      [
        { shapes: title('Das Ergebnis') + picture('rI', 0.1, 0.2, 0.8, 0.7, 'Pinnwand'), images: { rI: 'a.png' } },
        { shapes: title('Mit Zeile') + textBox(0.1, 0.9, 0.8, 0.05, 'Foto vom Vormittag') + picture('rI', 0.1, 0.2, 0.8, 0.6), images: { rI: 'a.png' } },
        { shapes: picture('rI', 0, 0, 1, 1, 'Ganze Folie'), images: { rI: 'b.png' } },
        { shapes: picture('rI', 0.2, 0.2, 0.5, 0.5), images: { rI: 'c.png' } },
      ],
      { 'a.png': png(1), 'b.png': png(2), 'c.png': png(3) },
    )
    expect(html[0]).toMatch(/^<section class="slide figure"><header><h2>Das Ergebnis<\/h2><\/header><figure class="main"><img src="assets\/[^"]+" alt="Pinnwand"><\/figure><\/section>$/)
    expect(html[1]).toContain('<figcaption>Foto vom Vormittag</figcaption>')
    expect(html[2]).toMatch(/^<section class="slide figure full"><figure class="main"><img src="assets\/[^"]+" alt="Ganze Folie"><\/figure><\/section>$/)
    expect(html[3]).toMatch(/^<section class="slide figure"><figure class="main"><img/)
  })

  it('reads titles alone as section or statement', async () => {
    const { html } = await read([
      { shapes: title('Feedback') },
      { shapes: title('Feedback geben') + subtitle('Wie wir einander sagen, was wir sehen') },
      { shapes: title('Was braucht dieses Team, um gut zu entscheiden?') },
      { shapes: placeholder('type="ctrTitle"', ['Zusammenarbeit im neuen Team']) + subtitle('Beispiel GmbH') },
      { shapes: title('Jede Veränderung beginnt mit einem Blick auf das, was schon funktioniert und bleiben soll, auch wenn das niemand so sagt') },
    ])
    expect(html[0]).toBe('<section class="slide section"><div class="text"><h1>Feedback</h1></div></section>')
    expect(html[1]).toBe('<section class="slide section"><div class="text"><h1>Feedback geben</h1><p class="lead">Wie wir einander sagen, was wir sehen</p></div></section>')
    expect(html[2]).toBe('<section class="slide statement"><div class="text"><p class="big">Was braucht dieses Team, um gut zu entscheiden?</p></div></section>')
    expect(layoutOf(html[3])).toBe('section')
    expect(html[4]).toContain('<div class="text long">')
  })

  it('reads a title with one sentence as a statement under its kicker', async () => {
    const { html } = await read([{ shapes: title('Leitfrage') + body('Was soll bleiben, wenn wir gehen?') }])
    expect(html[0]).toBe('<section class="slide statement"><div class="text"><div class="eyebrow">Leitfrage</div><p class="big">Was soll bleiben, wenn wir gehen?</p></div></section>')
  })

  it('reads a table, with its heading row, merged cells kept in line', async () => {
    const { html } = await read([
      {
        shapes: title('Zwei Wege') + table('firstRow="1" firstCol="1"', row(cell(''), cell('Konsens'), cell('Konsent')), row(cell('Frage'), cell('Sind alle dafür?'), cell('Hat jemand einen Einwand?')), row(cell('Tempo'), cell('Langsam', ' gridSpan="2"'), cell('', ' hMerge="1"'))),
      },
    ])
    expect(html[0]).toBe('<section class="slide table"><header><h2>Zwei Wege</h2></header><table><thead><tr><th></th><th>Konsens</th><th>Konsent</th></tr></thead><tbody><tr><td><strong>Frage</strong></td><td>Sind alle dafür?</td><td>Hat jemand einen Einwand?</td></tr><tr><td><strong>Tempo</strong></td><td>Langsam</td><td></td></tr></tbody></table></section>')
  })

  it('turns a table set from right to left round, so its columns stand where they stood', async () => {
    const { html } = await read([{ shapes: title('Übersicht') + table('rtl="1" firstRow="1" firstCol="1"', row(cell('Gruppe'), cell('Bedarf'), cell('Stärken')), row(cell('Kundschaft'), cell('Tempo'), cell('Nähe'))) }])
    expect(html[0]).toContain('<thead><tr><th>Stärken</th><th>Bedarf</th><th>Gruppe</th></tr></thead><tbody><tr><td>Nähe</td><td>Tempo</td><td><strong>Kundschaft</strong></td></tr></tbody>')
  })

  it('continues a long table on the next slide under the same heading row, and sets a wide one compact', async () => {
    const rows = Array.from({ length: 24 }, (_, i) => row(cell(`Zeile ${i}`), cell('Wert')))
    const wide = row(cell('a'), cell('b'), cell('c'), cell('d'), cell('e'))
    const { html } = await read([{ shapes: title('Lang') + table('firstRow="1"', row(cell('Name'), cell('Wert')), ...rows) }, { shapes: title('Breit') + table('', wide) }])
    const long = html.filter((h) => h.includes('Lang'))
    expect(long.length).toBeGreaterThan(1)
    expect(long.every((h) => h.includes('<thead><tr><th>Name</th><th>Wert</th></tr></thead>'))).toBe(true)
    expect(long.join('').match(/<td>Zeile/g)).toHaveLength(24)
    expect(html[html.length - 1]).toContain('<table class="compact"><tbody><tr><td>a</td>')
  })

  it('reads two parallel placeholders as compare, their positions coming from the layout', async () => {
    const left = placeholder('type="body" idx="3"', ['Rechts', { t: 'Muster', lvl: 1 }])
    const right = placeholder('type="body" idx="2"', ['Links', { t: 'Ursache', lvl: 1 }])
    const { html } = await read([{ shapes: title('Gegenüber') + left + right }])
    expect(layoutOf(html[0])).toBe('compare')
    expect(html[0].indexOf('Links')).toBeLessThan(html[0].indexOf('Rechts'))
    expect(html[0].match(/<div class="side">/g)).toHaveLength(2)
  })

  it('takes a heading from a box of its own or from the first bold line of a column', async () => {
    const a = textBox(0.05, 0.25, 0.4, 0.1, { t: 'Linear', b: true }) + textBox(0.05, 0.36, 0.4, 0.4, 'Ursache führt zu Wirkung', 'Lösung: Ursache beseitigen')
    const b = textBox(0.55, 0.25, 0.4, 0.5, { t: 'Zirkulär', b: true }, 'Verhalten erzeugt Verhalten', 'Lösung: anders reagieren')
    const { html } = await read([{ shapes: title('Wie denken wir?') + a + b }])
    expect(html[0]).toBe('<section class="slide compare"><header><h2>Wie denken wir?</h2></header><div class="compare"><div class="side"><h3>Linear</h3><ul class="list"><li>Ursache führt zu Wirkung</li><li>Lösung: Ursache beseitigen</li></ul></div><div class="side"><h3>Zirkulär</h3><ul class="list"><li>Verhalten erzeugt Verhalten</li><li>Lösung: anders reagieren</li></ul></div></div></section>')
  })

  it('reads text boxes on filled shapes in a row as cards, in a row with arrows as steps', async () => {
    const card = (x: number, h: string, t: string) => filled(x, 0.3, 0.27, 0.5, 'roundRect') + textBox(x + 0.01, 0.32, 0.25, 0.1, { t: h, b: true }) + textBox(x + 0.01, 0.44, 0.25, 0.3, t)
    const row3 = card(0.05, 'Sammeln', 'Was lief gut') + card(0.36, 'Verstehen', 'Muster finden') + card(0.67, 'Entscheiden', 'Eins festlegen')
    const { html } = await read([{ shapes: title('Drei Arten') + row3 }, { shapes: title('Der Ablauf') + row3 + filled(0.325, 0.5, 0.03, 0.05, 'rightArrow') + filled(0.635, 0.5, 0.03, 0.05, 'rightArrow') }])
    expect(html[0]).toBe('<section class="slide cards"><header><h2>Drei Arten</h2></header><ul class="cards cols-3"><li><h3>Sammeln</h3><p>Was lief gut</p></li><li><h3>Verstehen</h3><p>Muster finden</p></li><li><h3>Entscheiden</h3><p>Eins festlegen</p></li></ul></section>')
    expect(html[1]).toContain('<ol class="flow"><li><h3>Sammeln</h3><p>Was lief gut</p></li>')
  })

  it('pairs pictures with the cards they stand over', async () => {
    const col = (x: number, h: string) => picture('rI' + h, x, 0.25, 0.08, 0.14) + textBox(x, 0.42, 0.25, 0.1, { t: h, b: true }) + textBox(x, 0.53, 0.25, 0.1, 'Eine Zeile')
    const { html } = await read([{ shapes: title('Rollen') + col(0.05, 'A') + col(0.36, 'B') + col(0.67, 'C'), images: { rIA: 'a.png', rIB: 'b.png', rIC: 'c.png' } }], { 'a.png': png(1), 'b.png': png(2), 'c.png': png(3) })
    expect(html[0]).toMatch(/^<section class="slide cards">.*<ul class="cards cols-3"><li><img class="icon" src="assets\/[^"]+" alt=""><h3>A<\/h3><p>Eine Zeile<\/p><\/li>/)
  })

  it('shows several pictures side by side, and what a split leaves over on the next slide', async () => {
    const two = picture('rA', 0.05, 0.3, 0.4, 0.5) + picture('rB', 0.55, 0.3, 0.4, 0.5)
    const images = { rA: 'a.png', rB: 'b.png' }
    const { html, found, warnings, from } = await read([{ shapes: title('Vorher und nachher') + two, images }, { shapes: title('Bilder') + body('Ein Punkt mit einigen Wörtern, die zusammen schon mehr sind als ein kurzer Satz', 'Und noch ein Punkt mit weiteren Wörtern') + two, images }], { 'a.png': png(1), 'b.png': png(2) })
    expect(html[0]).toMatch(/^<section class="slide cards">.*<ul class="cards cols-2 picture contain"><li><img src="assets\/[^"]+" alt=""><\/li>/)
    expect(layoutOf(html[1])).toBe('split')
    expect(layoutOf(html[2])).toBe('figure')
    expect(from).toEqual([1, 2, 2])
    expect(warnings).toEqual([])
    expect([...found.all.keys()].filter((p) => p.startsWith('assets/'))).toHaveLength(2)
  })

  it('takes a short first line set apart in the only text box as the title, and a subtitle where there is no title', async () => {
    const box = textBox(0.1, 0.1, 0.8, 0.8, { t: '2. Offene Fragen', b: true, sz: 24, num: true }, { t: 'Fragen, auf die niemand mit Ja oder Nein antworten kann', sz: 18 }, { t: 'Was denken Sie darüber?', sz: 18 })
    const plain = textBox(0.1, 0.1, 0.8, 0.8, 'Erste Zeile ohne Auszeichnung', 'Zweite Zeile', 'Dritte Zeile')
    const { html } = await read([{ shapes: box }, { shapes: plain }, { shapes: subtitle('Teamtag im Herbst') + textBox(0.2, 0.8, 0.5, 0.08, { t: 'Moderation: Kim Beispiel', sz: 24 }) }])
    expect(html[0]).toBe('<section class="slide list"><header><h2>2. Offene Fragen</h2></header><ul class="list"><li>Fragen, auf die niemand mit Ja oder Nein antworten kann</li><li>Was denken Sie darüber?</li></ul></section>')
    expect(html[1]).not.toContain('<h2>')
    expect(html[2]).toContain('Teamtag im Herbst')
    expect(html[2]).toContain('Moderation: Kim Beispiel')
  })

  it('takes the one bold line near the top as the title, though it stands to the right of the text', async () => {
    const shapes = textBox(0.65, 0.06, 0.3, 0.1, { t: 'Regeln im Gespräch', b: true, sz: 24 }) + textBox(0.15, 0.09, 0.5, 0.8, { t: 'Ich bleibe beim Thema.', sz: 24 }, { t: 'Ich frage nach, statt zu deuten.', sz: 24 })
    const { html } = await read([{ shapes }])
    expect(html[0]).toBe('<section class="slide list"><header><h2>Regeln im Gespräch</h2></header><ul class="list"><li>Ich bleibe beim Thema.</li><li>Ich frage nach, statt zu deuten.</li></ul></section>')
  })

  it('reads columns under their headings column by column, not row by row', async () => {
    const column = (x: number, head: string, ...items: string[]) => labelled(x, 0.25, 0.25, 0.06, head) + items.map((t, i) => textBox(x + 0.02, 0.33 + i * 0.08 + x / 20, 0.22, 0.05, t)).join('')
    const { html } = await read([{ shapes: title('Kompetenzen') + column(0.05, 'Wissen', 'Modelle', 'Methoden', 'Begriffe') + column(0.37, 'Können', 'Zuhören', 'Fragen') + column(0.69, 'Haltung', 'Neugier', 'Geduld') }])
    expect(html).toHaveLength(1)
    expect(html[0]).toContain('<li><h3>Wissen</h3><ul class="list"><li>Modelle</li><li>Methoden</li><li>Begriffe</li></ul></li><li><h3>Können</h3><ul class="list"><li>Zuhören</li><li>Fragen</li></ul></li><li><h3>Haltung</h3>')
  })

  it('starts a new part at every further heading of a column, and reads close columns without headings one after the other', async () => {
    const left = labelled(0.05, 0.25, 0.3, 0.06, 'Beschreiben') + textBox(0.07, 0.32, 0.28, 0.05, 'Umfang') + textBox(0.07, 0.38, 0.28, 0.05, 'Struktur') + labelled(0.05, 0.45, 0.3, 0.06, 'Erkunden') + textBox(0.07, 0.52, 0.28, 0.05, 'Ausreißer')
    const right = labelled(0.55, 0.25, 0.3, 0.06, 'Einordnen') + textBox(0.57, 0.32, 0.28, 0.05, 'Herkunft') + textBox(0.57, 0.38, 0.28, 0.05, 'Zeitpunkt')
    const plain = (x: number, ...items: string[]) => items.map((t, i) => textBox(x, 0.3 + i * 0.06, 0.25, 0.05, t)).join('')
    const { html } = await read([{ shapes: title('Daten kennenlernen') + left + right }, { shapes: title('Begriffe') + plain(0.1, 'Eins', 'Zwei', 'Drei') + plain(0.6, 'Vier', 'Fünf', 'Sechs') }])
    expect(html[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).toContain('Beschreiben Umfang Struktur Erkunden Ausreißer Einordnen Herkunft Zeitpunkt')
    expect(html[1]).toContain('<li>Eins</li><li>Zwei</li><li>Drei</li><li>Vier</li><li>Fünf</li><li>Sechs</li>')
  })

  it('keeps each picture with the text beside it: under each other as cards, a row of name and description as one card', async () => {
    const goal = (y: number, rid: string, head: string) => picture(rid, 0.08, y, 0.14, 0.14) + textBox(0.24, y, 0.5, 0.14, { t: head, b: true }, 'Was damit gemeint ist, in einem Satz')
    const row = (y: number, rid: string, name: string) => picture(rid, 0.05, y, 0.07, 0.1) + textBox(0.14, y + 0.02, 0.15, 0.06, name) + textBox(0.31, y, 0.3, 0.1, `${name} übernimmt, was es schon gibt, und passt es an`) + textBox(0.63, y, 0.3, 0.1, 'Ein Beispiel aus dem Alltag dazu')
    const images = { rA: 'a.png', rB: 'b.png', rC: 'c.png' }
    const { html } = await read([{ shapes: title('Ziele') + goal(0.25, 'rA', 'Zusammenarbeit') + goal(0.42, 'rB', 'Werkzeuge') + goal(0.59, 'rC', 'Zuversicht'), images }, { shapes: title('Drei Typen') + row(0.3, 'rA', 'Nutzerin') + row(0.45, 'rB', 'Gestalter') + row(0.6, 'rC', 'Erfinderin'), images }], { 'a.png': png(1), 'b.png': png(2), 'c.png': png(3) })
    expect(html).toHaveLength(2)
    expect(html[0]).toMatch(/<ul class="cards cols-3 picture contain"><li><img src="assets\/[^"]+" alt=""><h3>Zusammenarbeit<\/h3><p>Was damit gemeint ist, in einem Satz<\/p><\/li><li><img [^>]+><h3>Werkzeuge<\/h3>/)
    expect(html[1]).toMatch(/<ul class="cards cols-3"><li><img class="icon" [^>]+><h3>Nutzerin<\/h3><ul class="list"><li>Nutzerin übernimmt, was es schon gibt, und passt es an<\/li><li>Ein Beispiel aus dem Alltag dazu<\/li><\/ul><\/li>/)
  })

  it('gives a picture a slide of its own where cards are too small, whole and under its name, and leaves icons over single words a list', async () => {
    const figure = (x: number, y: number, rid: string, name: string) => picture(rid, x, y, 0.15, 0.3) + textBox(x, y + 0.31, 0.15, 0.05, { t: name, b: true }) + textBox(x + 0.16, y, 0.28, 0.3, ...Array.from({ length: 5 }, (_, i) => `${name}, Merkmal ${i + 1}, in einigen Worten und noch etwas genauer beschrieben`))
    const word = (x: number, y: number, rid: string, t: string) => picture(rid, x, y, 0.05, 0.08) + textBox(x - 0.02, y + 0.09, 0.12, 0.05, t)
    const images = { rA: 'a.png', rB: 'b.png', rC: 'c.png' }
    const { html } = await read([{ shapes: title('Zwei Muster') + figure(0.03, 0.2, 'rA', 'Anklagen') + figure(0.52, 0.5, 'rB', 'Ablenken'), images }, { shapes: title('Ablauf') + word(0.1, 0.5, 'rA', 'Grundlagen') + word(0.4, 0.3, 'rB', 'Beispiele') + word(0.7, 0.6, 'rC', 'Praxis'), images }], { 'a.png': png(1), 'b.png': png(2), 'c.png': png(3) })
    expect(html.map(layoutOf)).toEqual(['split', 'split', 'list'])
    expect(html[0]).toMatch(/<div class="split contain figure-left"><div class="text"><h3>Anklagen<\/h3><ul class="list"><li>Anklagen, Merkmal 1/)
    expect(html[0]).not.toContain('Ablenken')
    expect(html[1]).toContain('Ablenken, Merkmal 5')
    expect(html[2]).not.toContain('<img')
  })

  it('sets two rows of pictures with their texts in one row where a slide does not hold two, and shows parts together by name before each has its slide', async () => {
    const book = (x: number, y: number, rid: string, name: string) => picture(rid, x, y, 0.1, 0.25) + textBox(x + 0.11, y, 0.3, 0.2, `${name}, Vorname`, { t: `Ein Buch über ${name}`, b: true }, 'Beispielverlag, 2020')
    const figure = (x: number, rid: string, name: string) => picture(rid, x, 0.25, 0.15, 0.3) + textBox(x, 0.56, 0.15, 0.05, { t: name, b: true }) + textBox(x + 0.16, 0.25, 0.15, 0.3, ...Array.from({ length: 5 }, (_, i) => `${name}, Merkmal ${i + 1}, in einigen Worten und genauer beschrieben`))
    const images = { rA: 'a.png', rB: 'b.png', rC: 'c.png', rD: 'd.png' }
    const { html } = await read(
      [
        { shapes: title('Zum Weiterlesen') + book(0.05, 0.2, 'rA', 'Alpha') + book(0.5, 0.2, 'rB', 'Beta') + book(0.05, 0.55, 'rC', 'Gamma') + book(0.5, 0.55, 'rD', 'Delta'), images },
        { shapes: title('Drei Muster') + figure(0.02, 'rA', 'Anklagen') + figure(0.35, 'rB', 'Ablenken') + figure(0.68, 'rC', 'Beschwichtigen'), images },
      ],
      { 'a.png': png(1), 'b.png': png(2), 'c.png': png(3), 'd.png': png(4) },
    )
    expect(html.map(layoutOf)).toEqual(['cards', 'cards', 'split', 'split', 'split'])
    expect(html[0]).toContain('<ul class="cards cols-4 picture contain">')
    expect(html[0].match(/<li><img/g)).toHaveLength(4)
    expect(html[1]).toMatch(/<ul class="cards cols-3 picture contain"><li><img [^>]+><h3>Anklagen<\/h3><\/li><li><img [^>]+><h3>Ablenken<\/h3><\/li>/)
    expect(html[3]).toContain('<h3>Ablenken</h3><ul class="list"><li>Ablenken, Merkmal 1')
  })

  it('keeps a tiny picture that sits on a heading as its icon', async () => {
    const part = (x: number, rid: string, head: string) => labelled(x, 0.25, 0.25, 0.06, head) + picture(rid, x + 0.005, 0.26, 0.025, 0.04) + ['Erstens', 'Zweitens', 'Drittens'].slice(0, x > 0.3 ? 2 : 3).map((t, i) => textBox(x + 0.02, 0.33 + i * 0.07, 0.22, 0.05, `${t} zu ${head}`)).join('')
    const { html } = await read([{ shapes: title('Daten') + part(0.05, 'rA', 'Beschreiben') + part(0.37, 'rB', 'Einordnen') + part(0.69, 'rC', 'Erkunden'), images: { rA: 'a.png', rB: 'b.png', rC: 'c.png' } }], { 'a.png': png(1), 'b.png': png(2), 'c.png': png(3) })
    expect(html[0]).toMatch(/<ul class="cards cols-3"><li><img class="icon" [^>]+><h3>Beschreiben<\/h3><ul class="list"><li>Erstens zu Beschreiben<\/li>/)
  })

  it('reads a slide that says it is an exercise as one', async () => {
    const { html } = await read([{ shapes: title('Übung: Feedback in Dreiergruppen') + body('Beobachtung schildern', 'Wirkung benennen', 'Wunsch äußern') }])
    expect(html[0]).toBe('<section class="slide exercise"><header><h2><span class="tag">Übung</span> Feedback in Dreiergruppen</h2></header><div class="exercise"><ol class="steps"><li>Beobachtung schildern</li><li>Wirkung benennen</li><li>Wunsch äußern</li></ol></div></section>')
  })

  it('takes the largest text near the top as the title of a deck without placeholders, the line above as its kicker', async () => {
    const shapes = textBox(0.05, 0.06, 0.6, 0.04, { t: 'Tag 1', sz: 11, b: true }) + textBox(0.05, 0.1, 0.8, 0.1, { t: 'Was ist Führung', sz: 28, b: true }) + textBox(0.05, 0.3, 0.8, 0.4, { t: 'Eine Rolle', sz: 14 }, { t: 'Eine Wirkung im System', sz: 14 })
    const { html } = await read([{ shapes }])
    expect(html[0]).toBe('<section class="slide list"><header><div class="eyebrow">Tag 1</div><h2>Was ist Führung</h2></header><ul class="list"><li>Eine Rolle</li><li>Eine Wirkung im System</li></ul></section>')
  })

  it('reads a filled slide of a few words as a divider', async () => {
    const shapes = filled(0, 0, 1, 1) + textBox(0.08, 0.3, 0.6, 0.2, { t: 'Modul Zwei', sz: 44, b: true }) + textBox(0.08, 0.5, 0.6, 0.1, { t: 'Vom Wissen zum Tun', sz: 20 })
    const { html } = await read([{ shapes }])
    expect(html[0]).toBe('<section class="slide section"><div class="text"><h1>Modul Zwei</h1><p class="lead">Vom Wissen zum Tun</p></div></section>')
  })

  it('keeps a second line of a long title as the lead, and joins a wrapped one', async () => {
    const lines = (a: string, b: string) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="t"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>${a}</a:t></a:r><a:br/><a:r><a:t>${b}</a:t></a:r></a:p></p:txBody></p:sp>`
    const { html } = await read([
      { shapes: lines('Wirksamkeit', 'Wenn wir erleben, dass unser Tun einen Unterschied macht, bleiben wir dran') + body('Erster Punkt', 'Zweiter Punkt') },
      { shapes: lines('Führung in', 'Veränderung') + body('Erster Punkt', 'Zweiter Punkt') },
    ])
    expect(html[0]).toContain('<h2>Wirksamkeit</h2><p class="lead">Wenn wir erleben')
    expect(html[1]).toContain('<h2>Führung in Veränderung</h2>')
  })

  it('moves a source to the footer', async () => {
    const { html } = await read([{ shapes: title('Modell') + body('Erster Punkt', 'Zweiter Punkt') + textBox(0.05, 0.9, 0.8, 0.05, 'Quelle: Beispielbuch, 2020') }])
    expect(html[0]).toContain('<footer><span class="source">Quelle: Beispielbuch, 2020</span></footer>')
    expect(html[0]).not.toContain('<li>Quelle')
  })
})

describe('deckFromPptx, reading the file', () => {
  it('follows the order of presentation.xml, not the names of the parts', async () => {
    const { html } = await read([{ shapes: title('Zweite') }, { shapes: title('Erste') }, { shapes: title('Dritte') }], {}, [1, 0, 2])
    expect(html.map((h) => /<h1>(.*?)<\/h1>/.exec(h)?.[1])).toEqual(['Erste', 'Zweite', 'Dritte'])
  })

  it('skips hidden slides and hidden shapes, and counts warnings by the number in the file', async () => {
    const chart = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="c"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame>'
    const hiddenShape = textBox(0.1, 0.5, 0.5, 0.1, 'Versteckt').replace('name="t"', 'name="t" hidden="1"')
    const { html, slides, warnings } = await read([{ shapes: title('Eins') + hiddenShape }, { shapes: title('Zwei') + chart, hidden: true, notes: 'Geheim' }, { shapes: title('Drei') + chart }])
    expect(slides).toBe(2)
    expect(html.join('')).not.toContain('Zwei')
    expect(html.join('')).not.toContain('Versteckt')
    expect(warnings).toEqual([{ slide: 3, what: 'chart' }])
  })

  it('keeps the last step of a build and one of two copies, with the notes of all, and leaves a divider before its slide', async () => {
    const step = (...points: string[]) => title('Drei Schritte') + body(...points)
    const { html, from, found } = await read([
      { shapes: step('Sammeln'), notes: 'Erst nur sammeln lassen' },
      { shapes: step('Sammeln', 'Ordnen') },
      { shapes: step('Sammeln', 'Ordnen', 'Entscheiden'), notes: 'Am Ende abstimmen' },
      { shapes: step('Sammeln', 'Ordnen', 'Entscheiden') },
      { shapes: title('Feedback') },
      { shapes: title('Feedback') + body('Beobachtung', 'Wirkung', 'Wunsch') },
      { shapes: title('Feedback') + body('Etwas anderes', 'Und noch etwas') },
    ])
    expect(html.map(layoutOf)).toEqual(['list', 'section', 'list', 'list'])
    expect(from).toEqual([4, 5, 6, 7])
    expect(html[0]).toContain('<li>Sammeln</li><li>Ordnen</li><li>Entscheiden</li>')
    expect(found.meta.entries).toEqual([{ title: 'Drei Schritte', notes: 'Erst nur sammeln lassen\nAm Ende abstimmen', slides: ['001-list.html'] }])
  })

  it('takes a hyphen out of a word the deck writes in one piece elsewhere, and leaves every other hyphen', async () => {
    const { html } = await read([{ shapes: title('Selbstwirksamkeit') + body('Selbst-wirksamkeit und Wert-schätzung', 'Der Kick-off im Team', 'Selbst-Wirksamkeit') }])
    expect(html[0]).toContain('<li>Selbstwirksamkeit und Wert-schätzung</li><li>Der Kick-off im Team</li><li>Selbst-Wirksamkeit</li>')
  })

  it('drops footers, dates and slide numbers, and whatever the layout shows', async () => {
    const shapes = title('Inhalt') + body('Erster Punkt', 'Zweiter Punkt') + placeholder('type="ftr" idx="11"', ['Fußzeile']) + placeholder('type="dt" idx="10"', ['1.1.2026']) + placeholder('type="sldNum" idx="12"', ['7'])
    const { html } = await read([{ shapes }])
    for (const gone of ['Fußzeile', '1.1.2026', '>7<', 'Decoration', 'Prompt']) expect(html[0]).not.toContain(gone)
  })

  it('drops running text: a page number typed in a box, a line repeated in the same place', async () => {
    const slide = (n: number) => ({ shapes: title(`Folie ${n}`) + body('Erster Punkt', 'Zweiter Punkt') + textBox(0.04, 0.95, 0.4, 0.04, 'Name des Seminars') + textBox(0.93, 0.95, 0.04, 0.04, String(n)) })
    const { html } = await read([slide(1), slide(2), slide(3), slide(4)])
    expect(html.join('')).not.toContain('Name des Seminars')
    expect(html.every((h) => (h.match(/<li>/g) ?? []).length === 2)).toBe(true)
  })

  it('reads text boxes top to bottom and left to right, and enters groups', async () => {
    const shapes = title('Reihenfolge') + textBox(0.55, 0.6, 0.3, 0.1, 'Vierte') + textBox(0.1, 0.3, 0.3, 0.1, 'Erste') + textBox(0.1, 0.6, 0.3, 0.1, 'Dritte')
    // The group shrinks and moves its child: in its own space it stands at the bottom, on the slide at the top right.
    const group = `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="7" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="${0.55 * W}" y="${0.3 * H}"/><a:ext cx="${0.3 * W}" cy="${0.1 * H}"/><a:chOff x="0" y="${5 * H}"/><a:chExt cx="${0.6 * W}" cy="${0.2 * H}"/></a:xfrm></p:grpSpPr>${textBox(0, 5, 0.6, 0.2, 'Zweite')}</p:grpSp>`
    const { html } = await read([{ shapes: shapes + group }])
    expect([...html[0].matchAll(/(Erste|Zweite|Dritte|Vierte)/g)].map((m) => m[1])).toEqual(['Erste', 'Zweite', 'Dritte', 'Vierte'])
  })

  it('takes the fallback of alternate content, and the choice when that holds a frame', async () => {
    const alternate = `<mc:AlternateContent><mc:Choice Requires="p14"><p:contentPart r:id="rX"/></mc:Choice><mc:Fallback>${textBox(0.1, 0.3, 0.8, 0.1, 'Aus dem Ersatz')}${textBox(0.1, 0.5, 0.8, 0.1, 'Noch ein Satz aus dem Ersatz, der lang genug ist')}</mc:Fallback></mc:AlternateContent>`
    const frame = `<mc:AlternateContent><mc:Choice Requires="cx1"><p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="c"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/drawing/2014/chartex"/></a:graphic></p:graphicFrame></mc:Choice><mc:Fallback>${textBox(0.1, 0.3, 0.8, 0.1, 'Dieses Diagramm ist nicht verfügbar')}</mc:Fallback></mc:AlternateContent>`
    const { html, warnings } = await read([{ shapes: title('Eins') + alternate }, { shapes: title('Zwei') + frame }])
    expect(html[0]).toContain('Aus dem Ersatz')
    expect(html[1]).not.toContain('nicht verfügbar')
    expect(warnings).toEqual([{ slide: 2, what: 'chart' }])
  })

  it('reads names under other prefixes by their namespace, and a BOM', async () => {
    const entries = await pptxEntries([{ shapes: title('Egal') }])
    const slide = entries.find((e) => e.path === 'ppt/slides/slide1.xml')!
    slide.data = `﻿<?xml version="1.0" encoding="UTF-8"?><x:sld xmlns:x="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:d="http://schemas.openxmlformats.org/drawingml/2006/main"><x:cSld><x:spTree><x:sp><x:nvSpPr><x:cNvPr id="2" name="a"/><x:cNvSpPr/><x:nvPr><x:ph type="title"/></x:nvPr></x:nvSpPr><x:spPr/><x:txBody><d:bodyPr/><d:p><d:r><d:t>Anderes Präfix</d:t></d:r></d:p></x:txBody></x:sp></x:spTree></x:cSld></x:sld>`
    const { found } = await deckFromPptx(asFile(await zip(entries)))
    expect(await found.fragments[0].text()).toContain('Anderes Präfix')
  })

  it('drops pictures that are decoration: tiny ones, a logo on most slides', async () => {
    const logo = picture('rL', 0.92, 0.04, 0.05, 0.08)
    const images = { rL: 'logo.png', rI: 'photo.png' }
    const content = (n: number) => ({ shapes: title(`Folie ${n}`) + body('Erster Punkt', 'Zweiter Punkt') + logo, images })
    const { html, found } = await read(
      [content(1), content(2), content(3), { shapes: title('Foto') + logo + picture('rI', 0.1, 0.2, 0.8, 0.7) + picture('rI', 0.01, 0.01, 0.02, 0.02), images }],
      { 'logo.png': png(1), 'photo.png': png(2) },
    )
    expect(html.slice(0, 3).every((h) => layoutOf(h) === 'list')).toBe(true)
    expect(layoutOf(html[3])).toBe('figure')
    expect([...found.all.keys()].filter((p) => p.startsWith('assets/'))).toHaveLength(1)
  })

  it('warns about pictures in formats the app does not take, and goes by the content, not the name', async () => {
    const shapes = (rid: string) => title('Bild') + body('Erster Punkt', 'Zweiter Punkt') + picture(rid, 0.5, 0.2, 0.4, 0.7)
    const { html, warnings, found } = await read(
      [
        { shapes: shapes('rI'), images: { rI: 'image1.emf' } },
        { shapes: shapes('rI'), images: { rI: 'image2.wmf' } },
        { shapes: shapes('rI'), images: { rI: 'image3.svg' } },
        { shapes: shapes('rI'), images: { rI: 'image4.tiff' } },
        { shapes: shapes('rI'), images: { rI: 'image5.png' } },
        { shapes: shapes('rI'), images: { rI: 'image6.emf' } },
        { shapes: shapes('rI'), images: { rI: 'missing.png' } },
        { shapes: shapes('rI').replace('r:embed="rI"', '') },
      ],
      { 'image1.emf': emf, 'image2.wmf': emf, 'image3.svg': new TextEncoder().encode('<svg/>'), 'image4.tiff': emf, 'image5.png': emf, 'image6.emf': png(3) },
    )
    expect(warnings).toEqual([
      { slide: 1, what: 'EMF picture' },
      { slide: 2, what: 'WMF picture' },
      { slide: 3, what: 'SVG picture' },
      { slide: 4, what: 'TIFF picture' },
      { slide: 5, what: 'picture in an unknown format' },
      { slide: 7, what: 'picture not found' },
    ])
    expect(html.map(layoutOf)).toEqual(['list', 'list', 'list', 'list', 'list', 'split', 'list', 'list'])
    expect([...found.all.keys()].filter((p) => p.startsWith('assets/'))).toEqual([expect.stringMatching(/\.png$/)])
  })

  it('takes the PNG behind an SVG, leaves a linked picture alone and refuses what the server would', async () => {
    const svg = `<p:pic><p:nvPicPr><p:cNvPr id="5" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rI"><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rS"/></a:ext></a:extLst></a:blip></p:blipFill><p:spPr>${xfrm(0.2, 0.2, 0.5, 0.5)}</p:spPr></p:pic>`
    const linked = `<p:pic><p:nvPicPr><p:cNvPr id="5" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:link="rE"/></p:blipFill><p:spPr>${xfrm(0.2, 0.2, 0.5, 0.5)}</p:spPr></p:pic>`
    const { html, warnings } = await read(
      [
        { shapes: title('Vektor') + svg, images: { rI: 'a.png', rS: 'a.svg' } },
        { shapes: title('Verlinkt') + linked, rels: [['rE', `${REL}/image`, 'https://example.com/a.png', 'External']] },
        { shapes: title('Zu groß') + picture('rI', 0.2, 0.2, 0.5, 0.5), images: { rI: 'huge.png' } },
      ],
      { 'a.png': png(1), 'a.svg': new TextEncoder().encode('<svg/>'), 'huge.png': png(2, 10 * 1024 * 1024) },
    )
    expect(layoutOf(html[0])).toBe('figure')
    expect(html[1]).not.toContain('example.com')
    expect(warnings).toEqual([{ slide: 2, what: 'linked picture' }, { slide: 3, what: 'picture over 10 MB' }])
  })

  it('keeps the words of a SmartArt as a list, in their order, and says so', async () => {
    const frame = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="d"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1000000" y="1500000"/><a:ext cx="9000000" cy="4000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"><dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" r:dm="rD"/></a:graphicData></a:graphic></p:graphicFrame>'
    const pt = (id: string, text: string) => `<dgm:pt modelId="${id}"><dgm:t><a:bodyPr/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></dgm:t></dgm:pt>`
    const cxn = (src: string, dest: string, order: number) => `<dgm:cxn modelId="c${dest}" srcId="${src}" destId="${dest}" srcOrd="${order}" destOrd="0"/>`
    const data = `<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dgm:ptLst><dgm:pt modelId="0" type="doc"/>${pt('2', 'Zweiter Schritt')}${pt('1', 'Erster Schritt')}${pt('3', 'Unterpunkt')}<dgm:pt modelId="9" type="pres"><dgm:t><a:p><a:r><a:t>Nicht dies</a:t></a:r></a:p></dgm:t></dgm:pt></dgm:ptLst><dgm:cxnLst>${cxn('0', '1', 0)}${cxn('0', '2', 1)}${cxn('1', '3', 0)}${cxn('3', '0', 0)}</dgm:cxnLst></dgm:dataModel>`
    const { html, warnings } = await read([{ shapes: title('Prozess') + frame, rels: [['rD', `${REL}/diagramData`, '../diagrams/data1.xml']] }], {}, undefined, [{ path: 'ppt/diagrams/data1.xml', data }])
    expect(html[0]).toContain('<ul class="list"><li>Erster Schritt<ul><li>Unterpunkt</li></ul></li><li>Zweiter Schritt</li></ul>')
    expect(warnings).toEqual([{ slide: 1, what: 'SmartArt' }])
  })

  describe('a chart whose series has gaps', () => {
    const frame = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="d"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1000000" y="1500000"/><a:ext cx="9000000" cy="4000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rC"/></a:graphicData></a:graphic></p:graphicFrame>'
    const points = (values: [number, string][]) => values.map(([i, v]) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')
    const str = (values: [number, string][]) => `<c:strRef><c:f>A</c:f><c:strCache><c:ptCount val="3"/>${points(values)}</c:strCache></c:strRef>`
    const num = (values: [number, string][]) => `<c:numRef><c:f>B</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="3"/>${points(values)}</c:numCache></c:numRef>`
    const series = (name: string, cat: string, val: string) => `<c:ser><c:tx>${str([[0, name]])}</c:tx><c:cat>${cat}</c:cat><c:val>${val}</c:val></c:ser>`
    const chart = (...parts: string[]) => `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart>${parts.join('')}</c:barChart></c:plotArea></c:chart></c:chartSpace>`
    const rowsOf = async (data: string) => {
      const { html } = await read([{ shapes: title('Zahlen') + frame, rels: [['rC', `${REL}/chart`, '../charts/chart1.xml']] }], {}, undefined, [{ path: 'ppt/charts/chart1.xml', data }])
      return [...html[0].matchAll(/<tr>(.*?)<\/tr>/g)].map((row) => [...row[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/g)].map((c) => c[1].replace(/<[^>]+>/g, '')))
    }
    const quarters = str([[0, 'Q1'], [1, 'Q2'], [2, 'Q3']])

    it('keeps each number on its row', async () => {
      expect(await rowsOf(chart(series('Team A', quarters, num([[0, '1'], [2, '3']]))))).toEqual([['', 'Team A'], ['Q1', '1'], ['Q2', ''], ['Q3', '3']])
    })

    it('keeps the rows of two series together when only one has the gap', async () => {
      expect(await rowsOf(chart(series('A', quarters, num([[1, '5']])), series('B', quarters, num([[0, '1'], [1, '2'], [2, '3']]))))).toEqual([['', 'A', 'B'], ['Q1', '', '1'], ['Q2', '5', '2'], ['Q3', '', '3']])
    })

    it('takes the numbers in the order of their places, however the file lists them', async () => {
      expect(await rowsOf(chart(series('A', quarters, num([[2, '3'], [0, '1'], [1, '2']]))))).toEqual([['', 'A'], ['Q1', '1'], ['Q2', '2'], ['Q3', '3']])
    })

    it('shows the inner level of categories on several levels', async () => {
      const cat = `<c:multiLvlStrRef><c:f>A</c:f><c:multiLvlStrCache><c:ptCount val="2"/><c:lvl>${points([[0, 'Mai'], [1, 'Juni']])}</c:lvl><c:lvl>${points([[0, '2026']])}</c:lvl></c:multiLvlStrCache></c:multiLvlStrRef>`
      expect(await rowsOf(chart(series('A', cat, num([[0, '1'], [1, '2']]))))).toEqual([['', 'A'], ['Mai', '1'], ['Juni', '2']])
    })

    it('makes no table of a place far beyond what a table holds', async () => {
      const { html } = await read([{ shapes: title('Zahlen') + frame, rels: [['rC', `${REL}/chart`, '../charts/chart1.xml']] }], {}, undefined, [{ path: 'ppt/charts/chart1.xml', data: chart(series('A', quarters, num([[1000000000, '1']]))) }])
      expect(html[0]).not.toContain('<table')
    })
  })

  describe('text at the edges of a short slide', () => {
    const source = textBox(0.1, 0.88, 0.8, 0.08, 'Quelle: Beispiel 2019')
    const kicker = textBox(0.1, 0.05, 0.5, 0.06, 'Leitfrage')
    const heading = placeholder('type="title"', ['Warum das zählt'])

    it('keeps the source of a sentence that becomes a statement', async () => {
      const { html } = await read([{ shapes: title('Was soll bleiben, wenn wir gehen?') + source }])
      expect(html[0]).toContain('slide statement')
      expect(html[0]).toContain('<footer><span class="source">Quelle: Beispiel 2019</span></footer>')
    })

    it('keeps the source of a short title that becomes a section', async () => {
      const { html } = await read([{ shapes: title('Teil zwei') + source }])
      expect(html[0]).toContain('slide section')
      expect(html[0]).toContain('<footer><span class="source">Quelle: Beispiel 2019</span></footer>')
    })

    it('keeps the source of one sentence under a title', async () => {
      const { html } = await read([{ shapes: heading + textBox(0.1, 0.4, 0.8, 0.2, 'Wer fragt, führt das Gespräch.') + source }])
      expect(html[0]).toContain('Wer fragt, führt das Gespräch.')
      expect(html[0]).toContain('<span class="source">Quelle: Beispiel 2019</span>')
    })

    it('keeps kicker and title both, when a statement has room for only one of them', async () => {
      const { html } = await read([{ shapes: kicker + placeholder('type="title"', ['Warum das zählt'], xfrm(0.1, 0.15, 0.8, 0.1)) + textBox(0.1, 0.4, 0.8, 0.2, 'Wer fragt, führt das Gespräch.') + source }])
      for (const text of ['Leitfrage', 'Warum das zählt', 'Wer fragt, führt das Gespräch.', 'Quelle: Beispiel 2019']) expect(html[0]).toContain(text)
    })

    it('keeps the source of a long title that a section gives to a statement', async () => {
      const { html } = await read([{ shapes: placeholder('type="ctrTitle"', ['Ein Titel, der für einen Abschnitt viel zu lang geraten ist und nicht passt']) + source }])
      expect(html[0]).toContain('Quelle: Beispiel 2019')
    })
  })

  it('keeps the numbers of a chart as a table, and says so', async () => {
    const frame = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="d"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="1000000" y="1500000"/><a:ext cx="9000000" cy="4000000"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rC"/></a:graphicData></a:graphic></p:graphicFrame>'
    const data = '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart><c:plotArea><c:barChart><c:ser><c:tx><c:v>Team A</c:v></c:tx><c:cat><c:pt><c:v>Mai</c:v></c:pt><c:pt><c:v>Juni</c:v></c:pt></c:cat><c:val><c:pt><c:v>4.4000000000000004</c:v></c:pt><c:pt><c:v>2</c:v></c:pt></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>'
    const { html, warnings } = await read([{ shapes: title('Zahlen') + frame, rels: [['rC', `${REL}/chart`, '../charts/chart1.xml']] }], {}, undefined, [{ path: 'ppt/charts/chart1.xml', data }])
    expect(html[0]).toContain('<thead><tr><th></th><th>Team A</th></tr></thead><tbody><tr><td><strong>Mai</strong></td><td>4.4</td></tr><tr><td><strong>Juni</strong></td><td>2</td></tr></tbody>')
    expect(warnings).toEqual([{ slide: 1, what: 'chart' }])
  })

  it('warns about what has no counterpart: video, ink, embedded objects, a drawing of shapes', async () => {
    const video = `<p:pic><p:nvPicPr><p:cNvPr id="5" name="v"/><p:cNvPicPr/><p:nvPr><a:videoFile r:link="rV"/></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="rI"/></p:blipFill><p:spPr>${xfrm(0.2, 0.2, 0.5, 0.5)}</p:spPr></p:pic>`
    const ole = '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="9" name="o"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/presentationml/2006/ole"/></a:graphic></p:graphicFrame>'
    const drawing = [0.1, 0.3, 0.5, 0.7].map((x) => filled(x, 0.4, 0.1, 0.1, 'ellipse')).join('')
    const { warnings } = await read([{ shapes: title('Film') + video, images: { rI: 'a.png' } }, { shapes: title('Tinte') + '<p:contentPart r:id="rX"/>' }, { shapes: title('Objekt') + ole }, { shapes: title('Zeichnung') + drawing }], { 'a.png': png() })
    expect(warnings).toEqual([{ slide: 1, what: 'video' }, { slide: 2, what: 'ink drawing' }, { slide: 3, what: 'embedded object' }, { slide: 4, what: 'drawn shapes' }])
  })
})

describe('deckFromPptx, untrusted text', () => {
  it('keeps markup in slide text as text and typographic quotes as they are', async () => {
    const evil = '<script>alert(1)</script> <img src=x onerror=alert(1)> & „Zitat“ ‚klein‘ {{title}}'
    const { html } = await read([{ shapes: title(evil) + body(evil, { t: evil, lvl: 1 }) + picture('rI', 0.7, 0.3, 0.2, 0.5, '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'), images: { rI: 'a.png' } }, { shapes: title('Tabelle') + table('firstRow="1"', row(cell(evil))) }], { 'a.png': png() })
    for (const h of html) {
      expect(h).not.toMatch(/<(script|img src=x)/)
      expect(h).not.toContain('{{')
    }
    expect(html[0]).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt; &amp; „Zitat“ ‚klein‘ &#123;{title}}')
    expect(html[0]).toContain('alt="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"')
  })

  it('drops an alt text the sanitiser would refuse, and what PowerPoint added itself', async () => {
    const shapes = (descr: string) => title('Bild') + picture('rI', 0.2, 0.2, 0.5, 0.5, descr)
    const { html } = await read(
      [
        { shapes: shapes('Ein javascript-Handbuch'), images: { rI: 'a.png' } },
        { shapes: shapes('IMG_0042.jpg'), images: { rI: 'b.png' } },
        { shapes: shapes('Eine Feder AI-generated content may be incorrect.'), images: { rI: 'c.png' } },
        { shapes: shapes(`Lang ${'x'.repeat(400)}`), images: { rI: 'd.png' } },
      ],
      { 'a.png': png(1), 'b.png': png(2), 'c.png': png(3), 'd.png': png(4) },
    )
    expect(html[0]).toContain('alt=""')
    expect(html[1]).toContain('alt=""')
    expect(html[2]).toContain('alt="Eine Feder"')
    expect(/alt="([^"]*)"/.exec(html[3])![1].length).toBeLessThanOrEqual(300)
  })

  it('removes control characters and reads a pasted soft return', async () => {
    const { html } = await read([{ shapes: title('Text') + body('Eins_x000B_zwei', 'Drei') }])
    expect(html[0]).toContain('<li>Eins<br>zwei</li>')
  })
})

describe('deckFromPptx, speaker notes', () => {
  it('proposes a library entry per slide with notes, which importDeck turns into one with those notes', async () => {
    const { found, html } = await read([
      { shapes: title('Einstieg') + body('Erster Punkt', 'Zweiter Punkt'), notes: 'Langsam beginnen\nFrage stellen' },
      { shapes: title('Ohne Notizen') + body('Erster Punkt', 'Zweiter Punkt') },
      { shapes: picture('rI', 0.2, 0.2, 0.5, 0.5), images: { rI: 'a.png' }, notes: 'Bild zeigen' },
      { shapes: title('Einstieg') + body('Weiterer Punkt', 'Noch einer'), notes: 'Nachfragen' },
      { shapes: title('Leer') + body('Punkt eins', 'Punkt zwei'), notes: '' },
    ], { 'a.png': png() })
    expect(html).toHaveLength(5)
    expect(found.meta.entries).toEqual([
      { title: 'Einstieg', notes: 'Langsam beginnen\nFrage stellen\n\nNachfragen', slides: ['001-list.html', '004-list.html'] },
      { title: 'Beispieldeck 3', notes: 'Bild zeigen', slides: ['003-figure.html'] },
    ])
  })

  it('leaves the entries out when no slide has notes', async () => {
    const { found } = await read([{ shapes: title('Einstieg') }])
    expect(found.meta.entries).toBeUndefined()
  })
})

describe('deckFromPptx with importDeck', () => {
  beforeEach(() => {
    api.uploadAsset.mockReset()
    api.createDeck.mockReset()
    api.saveLibraryEntry.mockReset()
    api.uploadAsset.mockImplementation(async (_scope: string, file: File) => ({ hash: `${file.size.toString(16).padStart(16, '0')}`, cutout: null }))
    api.createDeck.mockImplementation(async (body: unknown) => ({ deck: body }))
    api.saveLibraryEntry.mockResolvedValue({})
  })

  it('gives importDeck what it takes: slides in order, pictures uploaded once, notes on the entries', async () => {
    const { found, html } = await read(
      [
        { shapes: title('Eins') + picture('rI', 0.1, 0.2, 0.8, 0.7, 'Bild'), images: { rI: 'a.png' }, notes: 'Eine Notiz' },
        { shapes: title('Zwei') + body('Erster Punkt, der etwas länger ist und mehr als nur ein paar Wörter hat', 'Zweiter Punkt') + picture('rI', 0.55, 0.2, 0.4, 0.7), images: { rI: 'a.png' } },
      ],
      { 'a.png': png() },
    )
    const result = await importDeck(found, { createEntries: true, existingTitles: new Set(), categories: [] })
    expect(result.missing).toEqual([])
    expect(api.uploadAsset).toHaveBeenCalledTimes(1)
    const sent = api.createDeck.mock.calls[0][0] as { title: string; source: string; theme: string; slides: { html: string; caption: string }[] }
    expect(sent).toMatchObject({ title: 'Beispieldeck', source: 'Beispieldeck.pptx', theme: '' })
    expect(sent.slides.map((s) => s.caption)).toEqual(['Eins', 'Zwei'])
    expect(sent.slides[0].html).toBe(html[0].replace(/src="assets\/[^"]+"/, `src="asset:${png().length.toString(16).padStart(16, '0')}"`))
    expect(api.saveLibraryEntry).toHaveBeenCalledTimes(1)
    const entry = api.saveLibraryEntry.mock.calls[0][0] as { title: string; data: { notes: string; slides: { html: string }[] } }
    expect(entry.title).toBe('Eins')
    expect(entry.data.notes).toBe('Eine Notiz')
    expect(entry.data.slides.map((s) => s.html)).toEqual([sent.slides[0].html])
    expect(slideTitle(sent.slides[1].html)).toBe('Zwei')
  })
})

describe('deckFromPptx, a file that is none', () => {
  const failing = async (bytes: Uint8Array) => deckFromPptx(asFile(bytes))

  it('says what is wrong with a file that is not a deck', async () => {
    await expect(failing(new TextEncoder().encode('Das ist kein Archiv, nur Text.'))).rejects.toThrow(/not a PowerPoint file/)
    await expect(failing(new Uint8Array(0))).rejects.toThrow(/not a PowerPoint file/)
    await expect(failing(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).rejects.toThrow(/\.ppt file, or one protected by a password/)
    await expect(failing(await zip([{ path: 'word/document.xml', data: '<w/>' }]))).rejects.toThrow(/holds no presentation/)
  })

  it('throws an Error for damaged parts, never hangs on them', async () => {
    const broken = async (replace: (entries: ZipEntry[]) => void) => {
      const entries = await pptxEntries([{ shapes: title('Eins') }])
      replace(entries)
      return zip(entries)
    }
    const slide = (e: ZipEntry[]) => e.find((x) => x.path === 'ppt/slides/slide1.xml')!
    await expect(failing(await broken((e) => (slide(e).data = '<p:sld><unclosed>')))).rejects.toThrow(/cannot be read/)
    await expect(failing(await broken((e) => (slide(e).data = new Uint8Array([0x3c, 0xff, 0xfe, 0x3e]))))).rejects.toThrow(/valid UTF-8/)
    await expect(failing(await broken((e) => e.splice(e.indexOf(slide(e)), 1)))).rejects.toThrow(/slide1\.xml is missing/)
    await expect(failing(await broken((e) => (slide(e).data = '<!DOCTYPE lol [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><p:sld>&b;</p:sld>')))).rejects.toThrow(/document type/)
    await expect(failing(await broken((e) => (slide(e).data = `${'<a>'.repeat(100_000)}${'</a>'.repeat(100_000)}`)))).rejects.toThrow(/nested too deeply/)
  })

  it('refuses a deck that shows nothing', async () => {
    await expect(deckFromPptx(asFile(await zip(await pptxEntries([{ shapes: '' }]))))).rejects.toThrow(/no slides/)
  })

  it('stays within bounds on a slide of many thousand shapes', async () => {
    const many = Array.from({ length: 20_000 }, (_, i) => textBox((i % 100) / 100, Math.floor(i / 100) / 200, 0.01, 0.005, `Wort ${i}`)).join('')
    const started = performance.now()
    const { html, warnings } = await read([{ shapes: title('Voll') + many }])
    expect(performance.now() - started).toBeLessThan(20_000)
    expect(html.length).toBeLessThanOrEqual(500)
    expect(warnings).toEqual([{ slide: 1, what: 'more slides than a pool deck takes' }])
  }, 30_000)
})

describe('parseXml', () => {
  it('reads elements, attributes, text, entities and CDATA', () => {
    const root = parseXml(`<?xml version="1.0"?><!-- note --><a x="1" y='&lt;2&#x3e;'><b>Tom &amp; Jerry &#8222;<![CDATA[<raw>]]></b><c/> </a>`)
    expect(root.name).toBe('a')
    expect({ ...root.attrs }).toEqual({ x: '1', y: '<2>' })
    expect(root.children.map((c) => c.name)).toEqual(['b', 'c'])
    expect(root.children[0].text).toBe('Tom & Jerry „<raw>')
  })

  it('names elements and attributes by namespace', () => {
    const root = parseXml('<q:sld xmlns:q="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:rr="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><thing rr:id="r1" xml:lang="de"/></q:sld>')
    expect(root.name).toBe('p:sld')
    expect(root.children[0].attrs['r:id']).toBe('r1')
    expect(root.children[0].attrs['xml:lang']).toBe('de')
  })

  it('finds descendants at any depth, in document order, without recursion', () => {
    const depth = MAX_XML_DEPTH - 2
    const root = parseXml(`<r>${'<d>'.repeat(depth)}<t>1</t>${'</d>'.repeat(depth)}<t>2</t></r>`)
    expect(descendants(root, 't').map((t) => t.text)).toEqual(['1', '2'])
  })

  it.each([
    ['nothing', ''],
    ['text only', 'nur Text'],
    ['an unclosed element', '<a><b></b>'],
    ['crossed elements', '<a><b></a></b>'],
    ['a closing tag alone', '</a>'],
    ['two roots', '<a/><b/>'],
    ['text after the root', '<a/>x'],
    ['an attribute without quotes', '<a b=1/>'],
    ['an attribute without value', '<a b/>'],
    ['the same attribute twice', '<a b="1" b="2"/>'],
    ['an unfinished attribute', '<a b="1'],
    ['"<" in an attribute', '<a b="<"/>'],
    ['an unfinished tag', '<a'],
    ['a stray ampersand', '<a>Tom & Jerry</a>'],
    ['an unknown entity', '<a>&nbsp;</a>'],
    ['a name from the prototype as an entity', '<a>&constructor;</a>'],
    ['an illegal character reference', '<a>&#0;</a>'],
    ['a character reference beyond Unicode', '<a>&#x110000;</a>'],
    ['a document type', '<!DOCTYPE a SYSTEM "http://example.com/a.dtd"><a/>'],
    ['an unfinished comment', '<a><!-- </a>'],
    ['CDATA outside the root', '<![CDATA[x]]><a/>'],
  ])('refuses %s', (_, xml) => {
    expect(() => parseXml(xml)).toThrow(BadXml)
  })

  it('stops at the limits, and works through a large document in linear time', () => {
    expect(() => parseXml(`${'<a>'.repeat(MAX_XML_DEPTH + 1)}${'</a>'.repeat(MAX_XML_DEPTH + 1)}`)).toThrow(/nested too deeply/)
    expect(() => parseXml(`<a ${Array.from({ length: 200 }, (_, i) => `b${i}="1"`).join(' ')}/>`)).toThrow(/too many attributes/)
    expect(() => parseXml(`<a>${'<b/>'.repeat(3_000_001)}</a>`)).toThrow(/too many elements/)
    const started = performance.now()
    expect(parseXml(`<a>${'<b c="1">text</b>'.repeat(300_000)}</a>`).children).toHaveLength(300_000)
    expect(performance.now() - started).toBeLessThan(5000)
    // The limit above is what this test is about; three million elements before it take their time when all tests run at once.
  }, 30_000)

  it('leaves the prototype of attributes alone', () => {
    const root = parseXml('<a __proto__="x" constructor="y"/>')
    expect(root.attrs.constructor).toBe('y')
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})
