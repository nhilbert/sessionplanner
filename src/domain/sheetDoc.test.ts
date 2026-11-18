import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalSheet, inlineText, newBlock, parseSheetPage, serializeSheetPage, textInline, type BlockKind, type BlockWords, type SheetBlock } from './sheetDoc.ts'
import { serializeNodes } from './slideTree.ts'
import { normalizeSheetHtml, SHEET_BLOCK_NAMES } from './sheets.ts'

const dir = path.join(import.meta.dirname, '..', '..', 'scripts', 'sheets', 'examples', 'sheets', 'katalog')
const pages = readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => readFileSync(path.join(dir, f), 'utf8'))
const flat = (bs: SheetBlock[]): SheetBlock[] => bs.flatMap((b) => (b.kind === 'pair' ? [b, ...flat(b.columns[0]), ...flat(b.columns[1])] : [b]))
const words: BlockWords = { heading: 'Überschrift', text: 'Text', term: 'Begriff', explanation: 'Erklärung', question: 'Frage?', hint: 'Hinweis', prompt: 'Aufforderung …', step: 'Schritt', entry: 'Eintrag', label: 'Bezeichnung', rating: 'Einschätzung', criterion: 'Kriterium', note: 'Notiz …', caption: 'Bildunterschrift' }

describe('a worksheet page as a document', () => {
  it('reads every block of the catalogue as fields and writes the pages back as they were', () => {
    for (const html of pages) {
      const doc = parseSheetPage(html)
      expect(doc.headerRaw).toBeUndefined()
      expect(flat(doc.blocks).filter((b) => b.kind === 'raw')).toEqual([])
      expect(canonicalSheet(serializeSheetPage(doc))).toBe(canonicalSheet(html))
    }
  })

  it('changes only the field that was changed', () => {
    const doc = parseSheetPage(pages[1])
    const q = doc.blocks.find((b) => b.kind === 'question')!
    if (q.kind !== 'question') throw new Error()
    q.title = 'Was hat mich überrascht?'
    const before = canonicalSheet(pages[1])
    const after = canonicalSheet(serializeSheetPage(doc))
    expect(after).not.toBe(before)
    expect(after.replace('Was hat mich überrascht?', 'Was hat mir heute gut getan?')).toBe(before)
  })

  it('keeps what the fields do not know as source, untouched', () => {
    const odd = '<section class="sheet"><div class="block question lines-2"><h3>Frage</h3><p class="hint">a</p><p>mehr</p></div><div class="block grid g-2"><div class="field"><div class="block text"><p>verschachtelt</p></div></div></div><div class="block text"><p>x</p></div></section>'
    const doc = parseSheetPage(odd)
    expect(doc.blocks.map((b) => b.kind)).toEqual(['raw', 'raw', 'text'])
    expect(canonicalSheet(serializeSheetPage(doc))).toBe(canonicalSheet(odd))
  })

  it('keeps empty fields, rows and lines: on a sheet they are the point', () => {
    const empty = '<section class="sheet"><ul class="block ticks"><li></li><li></li><li></li></ul><div class="block grid g-2 h-30"><div class="field"></div><div class="field"></div></div></section>'
    const doc = parseSheetPage(empty)
    const ticks = doc.blocks[0]
    expect(ticks.kind === 'ticks' && ticks.items.length).toBe(3)
    expect(canonicalSheet(serializeSheetPage(doc))).toBe(canonicalSheet(empty))
    // a lost tick line would show
    expect(canonicalSheet(empty)).not.toBe(canonicalSheet(empty.replace('<li></li>', '')))
  })

  it('writes blanks as underscores and reads them back', () => {
    const nodes = textInline('Unser Antreiber: ___ und __ oder ____')
    expect(serializeNodes(nodes)).toBe('Unser Antreiber: <span class="blank"></span> und <span class="blank short"></span> oder <span class="blank long"></span>')
    expect(inlineText(nodes)).toBe('Unser Antreiber: ___ und __ oder ____')
    expect(serializeNodes(textInline('**fett** ==Akzent=='))).toBe('<strong>fett</strong> <span class="accent">Akzent</span>')
  })

  it('adds every block of the catalogue as fields that read back the same', () => {
    for (const kind of SHEET_BLOCK_NAMES as Exclude<BlockKind, 'raw'>[]) {
      const page = { landscape: false, header: null, blocks: [newBlock(kind, words)] }
      const html = normalizeSheetHtml(serializeSheetPage(page))
      const back = parseSheetPage(html)
      // a picture without a picture yet is not a block of its own until one is chosen
      if (kind === 'picture') continue
      expect(back.blocks[0].kind, kind).toBe(kind)
      expect(canonicalSheet(serializeSheetPage(back))).toBe(canonicalSheet(html))
    }
  })

  it('reads the orientation and the header', () => {
    const doc = parseSheetPage('<section class="sheet landscape"><header><div class="eyebrow">Arbeitsblatt</div><h1 class="accent fs-xl">Titel</h1><p class="lead">Eins</p><p class="lead">Zwei</p></header></section>')
    expect(doc.landscape).toBe(true)
    expect(doc.header).toEqual({ eyebrow: 'Arbeitsblatt', title: 'Titel', titleCls: 'accent fs-xl', leads: ['Eins', 'Zwei'], picture: null })
  })
})
