import { zip, type ZipEntry } from './zip.ts'

/**
 * The PPTX package of a deck (docs/slides.md, section 5): every slide a set of native shapes – text boxes with their
 * runs, rectangles and discs, pictures – placed where the browser laid the slide out, so the file opens as an editable
 * presentation and not as pictures of slides. Measuring is done in the browser (measure.ts); this file only writes
 * the Office Open XML, so it is testable without a page.
 *
 * Coordinates are pixels of the 1280 × 720 design size; one pixel is 9525 EMU, the slide 13.333 × 7.5 inches.
 */

export const EMU_PER_PX = 9525

export interface Color {
  /** RRGGBB */
  hex: string
  /** 0–1 */
  alpha: number
}

export interface GradientStop {
  color: Color
  /** 0–1 */
  at: number
}

export type Fill = { kind: 'solid'; color: Color } | { kind: 'linear'; angle: number; stops: GradientStop[] }

export interface Line {
  color: Color
  width: number
}

export interface Run {
  text: string
  /** A line break before this run's text. */
  br?: boolean
  font: string
  /** px of the design size */
  size: number
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  caps: boolean
  /** letter spacing in px */
  spacing: number
  color: Color
}

export interface Paragraph {
  align: 'l' | 'ctr' | 'r' | 'just'
  /** line spacing as a factor of the font's single spacing */
  lineSpacing?: number
  runs: Run[]
}

interface Box {
  name: string
  x: number
  y: number
  w: number
  h: number
}

export type Shape =
  | (Box & { kind: 'shape'; geom: 'rect' | 'roundRect' | 'ellipse'; radius?: number; fill?: Fill; line?: Line })
  | (Box & { kind: 'text'; paragraphs: Paragraph[]; vert?: 'vert' | 'vert270'; title?: boolean; /** false: one line that grows instead of wrapping */ wrap?: boolean })
  | (Box & { kind: 'picture'; media: number; descr?: string; crop?: { l: number; t: number; r: number; b: number }; alpha?: number })

export interface Media {
  ext: 'png' | 'jpeg' | 'svg'
  data: Uint8Array
  /** For an SVG: the PNG that older readers show instead (index into media). */
  fallback?: number
}

export interface PptxSlide {
  background?: Color
  shapes: Shape[]
}

export interface PptxTheme {
  name: string
  /** RRGGBB: dark 1 and 2, light 1 and 2, accents 1–6 */
  colors: { dk1: string; lt1: string; dk2: string; lt2: string; accents: string[] }
  fonts: { major: string; minor: string }
}

export interface PptxDeck {
  title: string
  lang: string
  theme: PptxTheme
  slides: PptxSlide[]
  media: Media[]
}

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** XML text and attribute values; characters XML 1.0 does not allow are dropped. */
export const xmlEsc = (s: string): string =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const emu = (px: number): number => Math.round(px * EMU_PER_PX)
const hex6 = (h: string): string => (/^[0-9a-f]{6}$/i.test(h) ? h.toUpperCase() : '000000')

function colorXml(c: Color): string {
  const alpha = Math.round(Math.min(Math.max(c.alpha, 0), 1) * 100000)
  return alpha >= 100000 ? `<a:srgbClr val="${hex6(c.hex)}"/>` : `<a:srgbClr val="${hex6(c.hex)}"><a:alpha val="${alpha}"/></a:srgbClr>`
}

function fillXml(fill: Fill | undefined): string {
  if (!fill) return '<a:noFill/>'
  if (fill.kind === 'solid') return `<a:solidFill>${colorXml(fill.color)}</a:solidFill>`
  const stops = fill.stops.map((s) => `<a:gs pos="${Math.round(Math.min(Math.max(s.at, 0), 1) * 100000)}">${colorXml(s.color)}</a:gs>`).join('')
  const ang = Math.round((((fill.angle % 360) + 360) % 360) * 60000)
  return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${ang}" scaled="0"/></a:gradFill>`
}

const xfrm = (b: Box): string => `<a:xfrm><a:off x="${emu(b.x)}" y="${emu(b.y)}"/><a:ext cx="${Math.max(emu(b.w), 1)}" cy="${Math.max(emu(b.h), 1)}"/></a:xfrm>`

function runProps(r: Run, lang: string, tag: 'rPr' | 'endParaRPr'): string {
  const attrs = [
    `lang="${xmlEsc(lang)}"`,
    `sz="${Math.max(100, Math.round(r.size * 75))}"`,
    `b="${r.bold ? 1 : 0}"`,
    `i="${r.italic ? 1 : 0}"`,
    r.underline ? 'u="sng"' : '',
    r.strike ? 'strike="sngStrike"' : '',
    r.caps ? 'cap="all"' : '',
    Math.abs(r.spacing) >= 0.05 ? `spc="${Math.round(r.spacing * 75)}"` : '',
    'dirty="0"',
  ].filter(Boolean)
  const font = xmlEsc(r.font)
  return `<a:${tag} ${attrs.join(' ')}><a:solidFill>${colorXml(r.color)}</a:solidFill><a:latin typeface="${font}"/><a:ea typeface="${font}"/><a:cs typeface="${font}"/></a:${tag}>`
}

function paragraphXml(p: Paragraph, lang: string): string {
  const spacing = p.lineSpacing && Math.abs(p.lineSpacing - 1) > 0.01 ? `<a:lnSpc><a:spcPct val="${Math.round(p.lineSpacing * 100000)}"/></a:lnSpc>` : ''
  const runs = p.runs
    .map((r) => `${r.br ? `<a:br>${runProps(r, lang, 'rPr')}</a:br>` : ''}${r.text ? `<a:r>${runProps(r, lang, 'rPr')}<a:t>${xmlEsc(r.text)}</a:t></a:r>` : ''}`)
    .join('')
  const last = p.runs[p.runs.length - 1]
  return `<a:p><a:pPr algn="${p.align}" marL="0" indent="0">${spacing}<a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>${runs}${last ? runProps(last, lang, 'endParaRPr') : ''}</a:p>`
}

function shapeXml(s: Shape, id: number, lang: string, rel: (media: number) => { embed: string; svg?: string }): string {
  const name = xmlEsc(s.name)
  if (s.kind === 'shape') {
    const adj = s.geom === 'roundRect' ? `<a:gd name="adj" fmla="val ${Math.round(Math.min(0.5, (s.radius ?? 0) / Math.max(1, Math.min(s.w, s.h))) * 100000)}"/>` : ''
    const line = s.line ? `<a:ln w="${Math.max(emu(s.line.width), 1)}"><a:solidFill>${colorXml(s.line.color)}</a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>'
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(s)}<a:prstGeom prst="${s.geom}"><a:avLst>${adj}</a:avLst></a:prstGeom>${fillXml(s.fill)}${line}</p:spPr></p:sp>`
  }
  if (s.kind === 'text') {
    const nv = s.title ? `<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr>` : `<p:cNvSpPr txBox="1"/><p:nvPr/>`
    const vert = s.vert ? ` vert="${s.vert}"` : ''
    const body = `<a:bodyPr wrap="${s.wrap === false ? 'none' : 'square'}" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0" rtlCol="0"${vert}><a:noAutofit/></a:bodyPr><a:lstStyle/>${s.paragraphs.map((p) => paragraphXml(p, lang)).join('')}`
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/>${nv}</p:nvSpPr><p:spPr>${xfrm(s)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody>${body}</p:txBody></p:sp>`
  }
  const r = rel(s.media)
  const svg = r.svg ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${r.svg}"/></a:ext></a:extLst>` : ''
  const alpha = s.alpha !== undefined && s.alpha < 1 ? `<a:alphaModFix amt="${Math.round(Math.max(0, s.alpha) * 100000)}"/>` : ''
  const c = s.crop
  const crop = c && (c.l || c.t || c.r || c.b) ? `<a:srcRect l="${Math.round(c.l * 100000)}" t="${Math.round(c.t * 100000)}" r="${Math.round(c.r * 100000)}" b="${Math.round(c.b * 100000)}"/>` : ''
  const descr = s.descr ? ` descr="${xmlEsc(s.descr)}"` : ''
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}"${descr}/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${r.embed}">${alpha}${svg}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(s)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
}

const relsXml = (rels: { id: string; type: string; target: string }[]): string =>
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.map((r) => `<Relationship Id="${r.id}" Type="${REL}/${r.type}" Target="${xmlEsc(r.target)}"/>`).join('')}</Relationships>`

const mediaName = (i: number, m: Media): string => `image${i + 1}.${m.ext}`

function slideXml(slide: PptxSlide, deck: PptxDeck): { xml: string; rels: string } {
  const rels: { id: string; type: string; target: string }[] = [{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }]
  const byMedia = new Map<number, string>()
  const relOf = (i: number): string => {
    let id = byMedia.get(i)
    if (!id) {
      id = `rId${rels.length + 1}`
      rels.push({ id, type: 'image', target: `../media/${mediaName(i, deck.media[i])}` })
      byMedia.set(i, id)
    }
    return id
  }
  const rel = (i: number) => {
    const m = deck.media[i]
    if (m?.ext === 'svg' && m.fallback !== undefined) return { embed: relOf(m.fallback), svg: relOf(i) }
    return { embed: relOf(i) }
  }
  let id = 2
  const shapes = slide.shapes.map((s) => shapeXml(s, id++, deck.lang, rel)).join('')
  const bg = slide.background ? `<p:bg><p:bgPr><a:solidFill>${colorXml(slide.background)}</a:solidFill><a:effectLst/></p:bgPr></p:bg>` : ''
  const xml = `${XML}<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  return { xml, rels: relsXml(rels) }
}

function themeXml(t: PptxTheme): string {
  const c = t.colors
  const accents = [...t.colors.accents, '2F6F8F', 'B5513D', 'C99A2E', '5B8E7D', '22272E', '828488'].slice(0, 6)
  const font = (f: string) => `<a:latin typeface="${xmlEsc(f)}"/><a:ea typeface=""/><a:cs typeface=""/>`
  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
  return `${XML}<a:theme xmlns:a="${NS_A}" name="${xmlEsc(t.name)}"><a:themeElements><a:clrScheme name="${xmlEsc(t.name)}"><a:dk1><a:srgbClr val="${hex6(c.dk1)}"/></a:dk1><a:lt1><a:srgbClr val="${hex6(c.lt1)}"/></a:lt1><a:dk2><a:srgbClr val="${hex6(c.dk2)}"/></a:dk2><a:lt2><a:srgbClr val="${hex6(c.lt2)}"/></a:lt2>${accents.map((a, i) => `<a:accent${i + 1}><a:srgbClr val="${hex6(a)}"/></a:accent${i + 1}>`).join('')}<a:hlink><a:srgbClr val="${hex6(accents[0])}"/></a:hlink><a:folHlink><a:srgbClr val="${hex6(accents[1])}"/></a:folHlink></a:clrScheme><a:fontScheme name="${xmlEsc(t.name)}"><a:majorFont>${font(t.fonts.major)}</a:majorFont><a:minorFont>${font(t.fonts.minor)}</a:minorFont></a:fontScheme><a:fmtScheme name="${xmlEsc(t.name)}"><a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst><a:lnStyleLst><a:ln w="6350">${solid}</a:ln><a:ln w="12700">${solid}</a:ln><a:ln w="19050">${solid}</a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`
}

/** The master's text styles: the theme's fonts, no bullets, no spacing – every slide sets its runs itself. */
function levels(font: '+mj-lt' | '+mn-lt', size: number): string {
  return Array.from({ length: 9 }, (_, i) => `<a:lvl${i + 1}pPr marL="0" indent="0" algn="l"><a:spcBef><a:spcPts val="0"/></a:spcBef><a:buNone/><a:defRPr sz="${size}"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="${font}"/><a:ea typeface="${font === '+mj-lt' ? '+mj-ea' : '+mn-ea'}"/><a:cs typeface="${font === '+mj-lt' ? '+mj-cs' : '+mn-cs'}"/></a:defRPr></a:lvl${i + 1}pPr>`).join('')
}

const titleSp = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="${emu(64)}" y="${emu(56)}"/><a:ext cx="${emu(1152)}" cy="${emu(120)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`
const emptyTree = (shapes: string) =>
  `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes}</p:spTree></p:cSld>`

function masterXml(): string {
  return `${XML}<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">${emptyTree(titleSp).replace('<p:cSld>', '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>')}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${levels('+mj-lt', 3900)}</p:titleStyle><p:bodyStyle>${levels('+mn-lt', 1650)}</p:bodyStyle><p:otherStyle>${levels('+mn-lt', 1650)}</p:otherStyle></p:txStyles></p:sldMaster>`
}

function layoutXml(): string {
  return `${XML}<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="titleOnly" preserve="1">${emptyTree(titleSp).replace('<p:cSld>', '<p:cSld name="Session Planner">')}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
}

/** The parts of the package, in the order they are written. */
export function pptxParts(deck: PptxDeck, created = new Date()): ZipEntry[] {
  const n = deck.slides.length
  const exts = new Set(deck.media.map((m) => m.ext))
  const mime: Record<Media['ext'], string> = { png: 'image/png', jpeg: 'image/jpeg', svg: 'image/svg+xml' }
  const pml = 'application/vnd.openxmlformats-officedocument.presentationml'
  const types = `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...exts].map((e) => `<Default Extension="${e}" ContentType="${mime[e]}"/>`).join('')}<Override PartName="/ppt/presentation.xml" ContentType="${pml}.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${pml}.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${pml}.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="${pml}.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="${pml}.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="${pml}.tableStyles+xml"/>${deck.slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${pml}.slide+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
  const rootRels = `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`
  const when = created.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const core = `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(deck.title)}</dc:title><dc:language>${xmlEsc(deck.lang)}</dc:language><dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified></cp:coreProperties>`
  const app = `${XML}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Session Planner</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>${n}</Slides></Properties>`
  const presRels = relsXml([
    { id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' },
    { id: 'rId2', type: 'theme', target: 'theme/theme1.xml' },
    { id: 'rId3', type: 'presProps', target: 'presProps.xml' },
    { id: 'rId4', type: 'viewProps', target: 'viewProps.xml' },
    { id: 'rId5', type: 'tableStyles', target: 'tableStyles.xml' },
    ...deck.slides.map((_, i) => ({ id: `rId${i + 6}`, type: 'slide', target: `slides/slide${i + 1}.xml` })),
  ])
  const presentation = `${XML}<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${deck.slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 6}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${emu(1280)}" cy="${emu(720)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`
  const parts: ZipEntry[] = [
    { path: '[Content_Types].xml', data: types },
    { path: '_rels/.rels', data: rootRels },
    { path: 'docProps/core.xml', data: core },
    { path: 'docProps/app.xml', data: app },
    { path: 'ppt/presentation.xml', data: presentation },
    { path: 'ppt/_rels/presentation.xml.rels', data: presRels },
    { path: 'ppt/presProps.xml', data: `${XML}<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>` },
    { path: 'ppt/viewProps.xml', data: `${XML}<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>` },
    { path: 'ppt/tableStyles.xml', data: `${XML}<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>` },
    { path: 'ppt/theme/theme1.xml', data: themeXml(deck.theme) },
    { path: 'ppt/slideMasters/slideMaster1.xml', data: masterXml() },
    { path: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: relsXml([{ id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' }, { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' }]) },
    { path: 'ppt/slideLayouts/slideLayout1.xml', data: layoutXml() },
    { path: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: relsXml([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]) },
  ]
  deck.slides.forEach((slide, i) => {
    const { xml, rels } = slideXml(slide, deck)
    parts.push({ path: `ppt/slides/slide${i + 1}.xml`, data: xml }, { path: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: rels })
  })
  deck.media.forEach((m, i) => parts.push({ path: `ppt/media/${mediaName(i, m)}`, data: m.data, compress: m.ext === 'svg' }))
  return parts
}

/** The .pptx file of a deck. */
export async function writePptx(deck: PptxDeck, created?: Date): Promise<Uint8Array> {
  return zip(pptxParts(deck, created))
}
