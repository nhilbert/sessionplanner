import { describe, expect, it } from 'vitest'
import { textLayer, winAnsi, writePdf } from './pdf'

const latin1 = (bytes: Uint8Array): string => Array.from(bytes, (b) => String.fromCharCode(b)).join('')
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

describe('pdf', () => {
  it('writes a page per slide with its picture, and an xref that points at every object', async () => {
    const bytes = await writePdf(
      [
        { jpeg, width: 2560, height: 1440, words: [{ text: 'Führung', x: 64, y: 56, w: 200, h: 60, size: 52 }] },
        { jpeg, width: 2560, height: 1440, words: [] },
      ],
      { title: 'Klausur (Team)', lang: 'de-DE', created: new Date('2026-11-04T10:00:00Z') },
    )
    const pdf = latin1(bytes)
    expect(pdf.startsWith('%PDF-1.7\n%')).toBe(true)
    expect(pdf).toContain('/Type /Pages /Count 2 /Kids [5 0 R 8 0 R]')
    expect(pdf).toContain('/MediaBox [0 0 960 540]')
    expect(pdf).toContain('/Width 2560 /Height 1440 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 4')
    expect(pdf).toContain('/CreationDate (D:20261104100000Z)')
    // the title as UTF-16 with its byte order mark, so umlauts and brackets need no escaping
    expect(pdf).toContain('/Title <FEFF004b006c')
    const xref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)![1])
    expect(pdf.slice(xref, xref + 5)).toBe('xref\n')
    const entries = pdf.slice(xref).split('\n').slice(3).filter((l) => / 00000 n $/.test(l))
    expect(entries).toHaveLength(10)
    entries.forEach((line, i) => expect(pdf.slice(Number(line.slice(0, 10))).startsWith(`${i + 1} 0 obj\n`)).toBe(true))
    expect(pdf).toContain('trailer\n<< /Size 11 /Root 1 0 R /Info 4 0 R >>')
  })

  it('lays the words over the page as invisible text, as wide as on the slide', () => {
    const layer = textLayer([{ text: 'Team', x: 100, y: 200, w: 120, h: 30, size: 25 }])
    expect(layer.startsWith('BT 3 Tr\n')).toBe(true)
    // 25 px = 18.75 pt; "Team" is 2556 units of Helvetica, so 120 px (90 pt) need a scale of 188 %
    expect(layer).toContain('/F1 18.75 Tf 187.79 Tz 1 0 0 1 75 ')
    expect(layer).toContain('<5465616d> Tj')
    expect(textLayer([])).toBe('')
  })

  it('encodes text in WinAnsi, typographic quotes and dashes included', () => {
    expect(winAnsi('„Ü“ – €')).toEqual([0x84, 0xdc, 0x93, 0x20, 0x96, 0x20, 0x80])
    expect(winAnsi('漢')).toEqual([0x3f])
  })
})
