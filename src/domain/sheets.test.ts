import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { circleSvg, drawCircles, isLandscape, normalizeSheetHtml, SHEET_BLOCK_NAMES, sheetBlocks, splitPages } from './sheets.ts'

describe('a worksheet page', () => {
  it('keeps the format and drops what could run', () => {
    const dirty = '<section class="sheet"><header><h1 onclick="x()">T</h1></header><script>alert(1)</script><div class="block question lines-3" style="color:red"><h3>Q</h3></div></section><p>after</p>'
    expect(normalizeSheetHtml(dirty)).toBe('<section class="sheet"><header><h1>T</h1></header><div class="block question lines-3"><h3>Q</h3></div></section>')
  })

  it('wraps markup without a root in a portrait page', () => {
    expect(normalizeSheetHtml('<div class="block text"><p>x</p></div>')).toBe('<section class="sheet"><div class="block text"><p>x</p></div></section>')
  })

  it('knows landscape pages and lists its blocks', () => {
    const page = normalizeSheetHtml('<section class="sheet landscape"><div class="block box h-40"></div><ol class="block steps"><li><h3>a</h3></li></ol><div class="block pair"><div><div class="block write lines-2"></div></div></div></section>')
    expect(isLandscape(page)).toBe(true)
    expect(isLandscape('<section class="sheet">')).toBe(false)
    expect(sheetBlocks(page)).toEqual(['box', 'steps', 'pair', 'write'])
  })

  it('takes a page whose root names its classes in another order', () => {
    const page = normalizeSheetHtml('<section class="landscape sheet"><div class="block write fill"></div></section>')
    expect(page).toBe('<section class="sheet landscape"><div class="block write fill"></div></section>')
    expect(isLandscape(page)).toBe(true)
    expect(splitPages('<section class="landscape sheet"><p>a</p></section>\n<section class="sheet"><p>b</p></section>')).toHaveLength(2)
    // a section that only sounds like one is content
    expect(splitPages('<section class="worksheet"><p>a</p></section>')).toHaveLength(1)
    expect(normalizeSheetHtml('<section class="sheets"><p>a</p></section>')).toBe('<section class="sheet"><section class="sheets"><p>a</p></section></section>')
  })

  it('every block of the catalogue has its own name', () => {
    expect(new Set(SHEET_BLOCK_NAMES).size).toBe(SHEET_BLOCK_NAMES.length)
  })
})

describe('the class of a page', () => {
  // ".sheet" is one page high and cut at its edge. The print views once shared the name for their paper, and the
  // planning overview printed its first page only.
  it('is the worksheets\' alone: nothing else in the app is styled or named .sheet', () => {
    const src = path.join(import.meta.dirname, '..')
    const files = (readdirSync(src, { recursive: true }) as string[]).filter((f) => /\.(tsx|css)$/.test(f) && !f.split(path.sep).includes('worksheets'))
    const named = files.filter((f) => {
      const text = readFileSync(path.join(src, f), 'utf8')
      return f.endsWith('.css') ? /(^|[\s,>+~(])\.sheet(?![\w-])/m.test(text) : /className=(?:"|\{cx\(')(?:[^"']*\s)?sheet(?:\s|"|')/.test(text)
    })
    expect(named).toEqual([])
  })
})

describe('the circle', () => {
  it('draws one spoke per entry, four without a list', () => {
    expect((circleSvg(6).match(/class="spoke"/g) ?? []).length).toBe(6)
    const drawn = drawCircles('<div class="block circle h-100"><p class="middle">Std.</p></div>')
    expect((drawn.match(/class="spoke"/g) ?? []).length).toBe(4)
    expect(drawn).toMatch(/^<div class="block circle h-100"><svg class="drawn"/)
  })

  it('draws again from the entries, replacing what was there, and survives the sanitiser', () => {
    const once = normalizeSheetHtml('<section class="sheet"><div class="block circle"><ol><li></li><li></li><li></li></ol></div><div class="block text"><p>x</p></div></section>')
    const twice = normalizeSheetHtml(once.replace('<li></li>', '<li></li><li></li><li></li>'))
    expect((once.match(/class="spoke"/g) ?? []).length).toBe(3)
    expect((twice.match(/class="spoke"/g) ?? []).length).toBe(5)
    expect((twice.match(/<svg/g) ?? []).length).toBe(1)
    expect(twice).toContain('<div class="block text"><p>x</p></div>')
  })
})

describe('the example sheets (scripts/sheets/examples)', () => {
  const dir = path.join(import.meta.dirname, '..', '..', 'scripts', 'sheets', 'examples', 'sheets', 'katalog')
  const pages = readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => readFileSync(path.join(dir, f), 'utf8'))
  const tight = (html: string) => html.replace(/<svg class="drawn"[\s\S]*?<\/svg>|<div class="points drawn">[\s\S]*?<\/div>/g, '').replace(/>\s+</g, '><').trim()

  it('are stored as they are written, the circle drawn', () => {
    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) expect(tight(normalizeSheetHtml(page))).toBe(tight(page))
  })

  it('use only blocks of the catalogue, and those of v1 and stage 4b all appear', () => {
    const used = new Set(pages.flatMap((p) => sheetBlocks(normalizeSheetHtml(p))))
    for (const b of used) expect(SHEET_BLOCK_NAMES).toContain(b)
    for (const b of ['text', 'terms', 'columns', 'table', 'steps', 'question', 'box', 'grid', 'rows', 'circle', 'criteria', 'ticks', 'note', 'facts', 'starters', 'matrix', 'timeline', 'shape', 'scale', 'selftest', 'ifthen']) expect(used).toContain(b)
  })
})
