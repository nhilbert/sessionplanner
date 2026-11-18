import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalSheet, inlineText, newBlock, parseSheetPage, serializeSheetPage, textInline, type BlockKind, type BlockWords, type SheetBlock } from './sheetDoc.ts'
import { serializeNodes } from './slideTree.ts'
import { normalizeSheetHtml, SHEET_BLOCK_NAMES } from './sheets.ts'

const dir = path.join(import.meta.dirname, '..', '..', 'scripts', 'sheets', 'examples', 'sheets', 'katalog')
const pages = readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => readFileSync(path.join(dir, f), 'utf8'))
const flat = (bs: SheetBlock[]): SheetBlock[] => bs.flatMap((b) => (b.kind === 'pair' ? [b, ...flat(b.columns[0]), ...flat(b.columns[1])] : [b]))
const words: BlockWords = { heading: 'Überschrift', text: 'Text', term: 'Begriff', explanation: 'Erklärung', question: 'Frage?', hint: 'Hinweis', prompt: 'Aufforderung …', step: 'Schritt', entry: 'Eintrag', label: 'Bezeichnung', rating: 'Einschätzung', criterion: 'Kriterium', note: 'Notiz …', caption: 'Bildunterschrift', noteTitle: 'Merke', starter: 'Mir ist wichtig, dass …', axisY: 'Wichtigkeit', axisX: 'Dringlichkeit', low: 'gar nicht', high: 'voll und ganz', never: 'nie', sometimes: 'selten', often: 'oft', always: 'immer', statement: 'Eine Aussage über mich.', sum: 'Summe:', when: 'Wenn …', then: 'dann …', certFor: 'Hiermit erhält', certTitle: 'Erlaubnis', together: 'Was wir gemeinsam festhalten' }

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

  it('hands out what it read as a copy: changing one reading never changes the next', () => {
    const html = '<section class="sheet"><header><h1>Titel</h1></header><div class="block question lines-2"><h3>Frage</h3></div></section>'
    const first = parseSheetPage(html)
    const q = first.blocks[0]
    if (q.kind !== 'question' || !first.header) throw new Error()
    q.title = 'geändert'
    first.header.title = 'geändert'
    const second = parseSheetPage(html)
    expect(second.header?.title).toBe('Titel')
    expect(second.blocks[0].kind === 'question' && second.blocks[0].title).toBe('Frage')
  })

  it('a page read anew from its source carries nothing of the page before', () => {
    const before = parseSheetPage('<section class="sheet"><header><h1>T</h1><div class="foo">x</div></header><div class="block text"><p>a</p></div></section>')
    expect(before.headerRaw).toBeDefined()
    const after = parseSheetPage('<section class="sheet"><div class="block text"><p>a</p></div></section>')
    expect(after.headerRaw).toBeUndefined()
    expect(serializeSheetPage(after)).not.toContain('<header>')
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

describe('starter sheets', () => {
  it('are pages of the catalogue in both languages, every block as fields, for every sample subject', async () => {
    const { SHEET_STARTERS, starterSheet, STARTER_WORDS } = await import('./sheetStarters.ts')
    const { SAMPLE_SETS } = await import('./sampleSets.ts')
    for (const lang of ['de', 'en'] as const)
      for (const set of SAMPLE_SETS[lang])
        for (const kind of SHEET_STARTERS) {
          const sheet = starterSheet(kind, set, STARTER_WORDS[lang])
          expect(sheet.title.trim(), kind).not.toBe('')
          for (const html of sheet.pages) {
            const doc = parseSheetPage(html)
            expect(flat(doc.blocks).filter((b) => b.kind === 'raw'), `${lang} ${set.name} ${kind}`).toEqual([])
            expect(doc.headerRaw).toBeUndefined()
          }
        }
  })
})

describe('typing on the page', () => {
  it('finds an element by its path and replaces its inline content, the rest as it was', async () => {
    const { setSheetInline, sheetElementAt } = await import('./sheetDoc.ts')
    const page = '<section class="sheet"><header><h1>Titel</h1></header><div class="block circle"><ol><li></li><li></li><li></li></ol><p class="middle">Std.</p></div><div class="block question lines-2"><h3>Frage</h3></div></section>'
    // the circle's drawing is the first child of its block, as in the page the browser shows
    expect(sheetElementAt(page, [1, 2], ['div', 'p'])?.attrs.class).toBe('middle')
    expect(sheetElementAt(page, [2, 0], ['div', 'p'])).toBeNull()
    const next = setSheetInline(page, [2, 0], textInline('Was **nehme** ich mit? ___'))!
    expect(next).toContain('<h3>Was <strong>nehme</strong> ich mit? <span class="blank"></span></h3>')
    expect(canonicalSheet(next).replace(/<h3>Was.*?<\/h3>/, '<h3>Frage</h3>')).toBe(canonicalSheet(page))
    expect(setSheetInline(page, [9], [])).toBeNull()
  })
})
