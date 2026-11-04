import { describe, expect, it } from 'vitest'
import { type PptxDeck, type Run, writePptx, xmlEsc } from './ooxml'
import { crc32, zip } from './zip'

const inflate = async (raw: Uint8Array): Promise<Uint8Array> => new Uint8Array(await new Response(new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer())

/** The entries of a ZIP archive, read from its central directory, with their bytes checked against the CRC. */
async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--
  const count = v.getUint16(end + 10, true)
  let at = v.getUint32(end + 16, true)
  const out = new Map<string, Uint8Array>()
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50)
    const method = v.getUint16(at + 10, true)
    const crc = v.getUint32(at + 16, true)
    const size = v.getUint32(at + 20, true)
    const nameLen = v.getUint16(at + 28, true)
    const local = v.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLen))
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const raw = bytes.subarray(start, start + size)
    const data = method === 8 ? await inflate(raw) : raw
    expect(crc32(data)).toBe(crc)
    out.set(name, data)
    at += 46 + nameLen
  }
  return out
}

const text = (files: Map<string, Uint8Array>, name: string): string => new TextDecoder().decode(files.get(name))

const run = (text: string, extra: Partial<Run> = {}): Run => ({ text, font: 'Inter', size: 22, bold: false, italic: false, underline: false, strike: false, caps: false, spacing: 0, color: { hex: '22272E', alpha: 1 }, ...extra })

const deck: PptxDeck = {
  title: 'Klausur <Team> & Co',
  lang: 'de-DE',
  theme: { name: 'default', colors: { dk1: '22272E', lt1: 'FBFAF8', dk2: '22272E', lt2: 'ECECEA', accents: ['2F6F8F', 'B5513D'] }, fonts: { major: 'Manrope', minor: 'Inter' } },
  slides: [
    {
      background: { hex: 'FBFAF8', alpha: 1 },
      shapes: [
        { kind: 'shape', name: 'disc', geom: 'ellipse', x: 700, y: 200, w: 720, h: 720, fill: { kind: 'solid', color: { hex: 'F4A261', alpha: 1 } } },
        { kind: 'text', name: 'Title', title: true, x: 64, y: 56, w: 1000, h: 60, paragraphs: [{ align: 'l', lineSpacing: 0.9, runs: [run('Was „wir“ <sehen>', { size: 52, bold: true })] }] },
        { kind: 'text', name: 'p.lead', x: 64, y: 140, w: 600, h: 60, wrap: false, paragraphs: [{ align: 'l', runs: [run('Eins '), run('zwei', { italic: true }), run('drei', { br: true, caps: true, spacing: 2.6 })] }] },
        { kind: 'picture', name: 'Foto', descr: 'Pinnwand', media: 0, x: 640, y: 0, w: 640, h: 720, crop: { l: 0.1, t: 0, r: 0.1, b: 0 } },
        { kind: 'picture', name: 'diagram', media: 2, x: 100, y: 300, w: 400, h: 300 },
      ],
    },
    { shapes: [{ kind: 'shape', name: 'rule', geom: 'rect', x: 64, y: 400, w: 1152, h: 1, fill: { kind: 'linear', angle: 0, stops: [{ color: { hex: '000000', alpha: 0.9 }, at: 0 }, { color: { hex: '000000', alpha: 0.1 }, at: 1 }] } }] },
  ],
  media: [
    { ext: 'jpeg', data: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) },
    { ext: 'png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) },
    { ext: 'svg', data: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), fallback: 1 },
  ],
}

describe('zip', () => {
  it('writes entries that read back with their CRC, deflated or stored', async () => {
    const body = 'abc'.repeat(1000)
    const files = await unzip(await zip([{ path: 'a.xml', data: body }, { path: 'b.bin', data: new Uint8Array([1, 2, 3]), compress: false }, { path: 'ü/ß.txt', data: '' }]))
    expect([...files.keys()]).toEqual(['a.xml', 'b.bin', 'ü/ß.txt'])
    expect(text(files, 'a.xml')).toBe(body)
    expect([...files.get('b.bin')!]).toEqual([1, 2, 3])
  })

  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('pptx', () => {
  it('writes the package parts with content types, relationships and media', async () => {
    const files = await unzip(await writePptx(deck, new Date('2026-11-04T10:00:00Z')))
    expect([...files.keys()][0]).toBe('[Content_Types].xml')
    const types = text(files, '[Content_Types].xml')
    for (const part of ['/ppt/presentation.xml', '/ppt/slides/slide1.xml', '/ppt/slides/slide2.xml', '/ppt/slideMasters/slideMaster1.xml', '/ppt/slideLayouts/slideLayout1.xml', '/ppt/theme/theme1.xml']) expect(types).toContain(`PartName="${part}"`)
    for (const ext of ['jpeg', 'png', 'svg']) expect(types).toContain(`Extension="${ext}"`)
    expect([...files.keys()]).toEqual(expect.arrayContaining(['ppt/media/image1.jpeg', 'ppt/media/image2.png', 'ppt/media/image3.svg']))
    const pres = text(files, 'ppt/presentation.xml')
    expect(pres).toContain('<p:sldSz cx="12192000" cy="6858000"/>')
    expect(pres.match(/<p:sldId /g)).toHaveLength(2)
    expect(text(files, 'docProps/core.xml')).toContain('<dc:title>Klausur &lt;Team&gt; &amp; Co</dc:title>')
    const theme = text(files, 'ppt/theme/theme1.xml')
    expect(theme).toContain('<a:majorFont><a:latin typeface="Manrope"/>')
    expect(theme).toContain('<a:accent1><a:srgbClr val="2F6F8F"/></a:accent1>')
  })

  it('writes shapes, text runs and pictures at their places', async () => {
    const files = await unzip(await writePptx(deck))
    const slide = text(files, 'ppt/slides/slide1.xml')
    const rels = text(files, 'ppt/slides/_rels/slide1.xml.rels')
    // a pixel of the design size is 9525 EMU
    expect(slide).toContain('<a:off x="609600" y="533400"/>')
    expect(slide).toContain('<p:ph type="title"/>')
    expect(slide).toContain('<a:t>Was „wir“ &lt;sehen&gt;</a:t>')
    expect(slide).toContain('sz="3900" b="1"')
    expect(slide).toContain('<a:spcPct val="90000"/>')
    expect(slide).toContain('<a:bodyPr wrap="none"')
    expect(slide).toContain('cap="all" spc="195"')
    expect(slide).toContain('<a:br>')
    expect(slide).toContain('prst="ellipse"')
    expect(slide).toContain('<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FBFAF8"/>')
    expect(slide).toContain('descr="Pinnwand"')
    expect(slide).toContain('<a:srcRect l="10000" t="0" r="10000" b="0"/>')
    // the SVG is shown from its PNG by readers that do not know SVG
    expect(slide).toMatch(/<a:blip r:embed="(rId\d+)"><a:extLst><a:ext uri="\{96DAC541-7B7A-43D3-8B79-37D633B846F1\}"><asvg:svgBlip [^>]* r:embed="(rId\d+)"/)
    expect(rels).toContain('Target="../media/image2.png"')
    expect(rels).toContain('Target="../media/image3.svg"')
    const second = text(files, 'ppt/slides/slide2.xml')
    expect(second).toContain('<a:lin ang="0" scaled="0"/>')
    expect(second).toContain('<a:alpha val="90000"/>')
  })

  it('escapes text for XML and drops characters XML does not allow', () => {
    expect(xmlEsc('a & "b" <c>\u0001')).toBe('a &amp; &quot;b&quot; &lt;c&gt;')
  })
})
