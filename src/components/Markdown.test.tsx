import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { oneLine, parseBlocks, plainLine, sourceOffset, tablesAsLines } from '@/domain/markdown'
import Markdown, { NoteText } from './Markdown'

const html = (text: string) => renderToStaticMarkup(<Markdown text={text} />)

describe('Markdown', () => {
  it('reads headings, lists and paragraphs', () => {
    expect(parseBlocks('# Ziel\nZeile eins\nZeile zwei\n\n- a\n- b\n1. x\n2. y').map((b) => b.type)).toEqual(['h', 'p', 'ul', 'ol'])
  })

  it('formats bold, italic, code, links and task lists', () => {
    const out = html('**fett** und *kursiv* und `code` und [Link](https://example.com)\n\n- [ ] offen\n- [x] erledigt')
    expect(out).toContain('<strong>fett</strong>')
    expect(out).toContain('<em>kursiv</em>')
    expect(out).toContain('<code')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('☐')
    expect(out).toContain('☑')
  })

  it("sets a note's one line after its title and a longer text below it", () => {
    const note = (title: string, text: string) => renderToStaticMarkup(<NoteText title={title} text={text} titleClassName="t" />)
    expect(oneLine('  Nur eine Zeile ')).toBe('Nur eine Zeile')
    expect([oneLine('zwei\nZeilen'), oneLine('- Liste'), oneLine('# Kopf'), oneLine('a\n\nb'), oneLine(' \n')]).toEqual([null, null, null, null, null])
    expect(note('Challenge des Tages', 'Heute **mutig** fragen')).toBe('<span class="t">Challenge des Tages</span> – Heute <strong>mutig</strong> fragen')
    expect(note('', 'Heute *mutig* fragen')).toBe('Heute <em>mutig</em> fragen')
    expect(note('Challenge', '')).toBe('<span class="t">Challenge</span>')
    const long = note('Challenge', '**Heute:** mutig fragen\n\n- eins\n- zwei')
    expect(long).toContain('<div class="t">Challenge</div>')
    expect(long).toContain('<strong>Heute:</strong> mutig fragen')
    expect(long).toContain('<li>eins</li>')
    expect(note('<b>x</b>', '<img src=x onerror=alert(1)>')).not.toContain('<img')
  })

  it('finds a place of the formatted text in its source', () => {
    const source = '## Ablauf\n**Erst** begrüßen, dann fragen.\n\n- fragen\n- dann **fragen** und warten'
    // "Erst" is the first run after the heading
    expect(sourceOffset(source, 'Ablauf', 'Erst', 2)).toBe(source.indexOf('Erst') + 2)
    // the same word a third time: its third place in the source
    expect(sourceOffset(source, 'AblaufErst begrüßen, dann fragen.fragendann ', 'fragen', 0)).toBe(source.lastIndexOf('fragen'))
    // a run the source does not hold as shown, and an empty one: the end
    expect(sourceOffset(source, '', 'nirgends', 3)).toBe(source.length)
    expect(sourceOffset(source, '', '', 0)).toBe(source.length)
    // a word that also stands in a link's address, which is not shown: the place is in the text
    const linked = 'Mehr im [Wiki](https://example.com/wiki/moderation), heute *moderation* üben'
    expect(sourceOffset(linked, 'Mehr im Wiki, heute ', 'moderation', 3)).toBe(linked.lastIndexOf('moderation') + 3)
    // a bar in a table's cell is typed with a backslash: the place moves by it
    const barred = '| A | B |\n|---|---|\n| Raum 1 \\| 2 | x |'
    expect(sourceOffset(barred, 'AB', 'Raum 1 | 2', 3)).toBe(barred.indexOf('Raum') + 3)
    expect(sourceOffset(barred, 'AB', 'Raum 1 | 2', 9)).toBe(barred.indexOf(' 2 | x') + 1)
    expect(plainLine('\n## **Ablauf** mit [Link](https://example.com)\nmehr')).toBe('Ablauf mit Link')
    expect(plainLine('- [ ] `eins`')).toBe('eins')
    expect(plainLine('*Liebe* Kolleg*innen, __alle__ ins Raum_2_OG')).toBe('Liebe Kolleg*innen, alle ins Raum_2_OG')
  })

  it('leaves stars and underscores inside words as typed', () => {
    expect(html('Liebe Kolleg*innen und Leiter*innen, *bitte* pünktlich')).toBe('<div><p class="my-1 first:mt-0 last:mb-0">Liebe Kolleg*innen und Leiter*innen, <em>bitte</em> pünktlich</p></div>')
    expect(html('Board: https://example.com/app/my_board_link und Raum_2_OG, 2*3*4')).toContain('Board: https://example.com/app/my_board_link und Raum_2_OG, 2*3*4')
    expect(html('a__b__c und x__init__, _so_ und __fett__')).toContain('a__b__c und x__init__, <em>so</em> und <strong>fett</strong>')
    // a star that opens nothing stays a star, and what follows is still read
    expect(html('Ein * allein, *a b * und **fett***')).toContain('Ein * allein, *a b * und <strong>fett</strong>*')
    expect(html('Teil**nehmer**innen, (*kursiv*) und „_kursiv_“')).toContain('Teil<strong>nehmer</strong>innen, (<em>kursiv</em>) und „<em>kursiv</em>“')
  })

  it('reads a table: head, rule, rows, and what stands around it', () => {
    const source = 'Kern\n| Wann | Thema | Ort |\n|---|:-:|--:|\n| Vormittag | **Aufträge** | Raum 1 \\| 2 |\n| Nachmittag | Fragen |\nDanach'
    const parsed = parseBlocks(source)
    expect(parsed.map((b) => b.type)).toEqual(['p', 'table', 'p'])
    expect(parsed[1]).toEqual({ type: 'table', head: ['Wann', 'Thema', 'Ort'], align: [null, 'center', 'right'], rows: [['Vormittag', '**Aufträge**', 'Raum 1 | 2'], ['Nachmittag', 'Fragen', '']] })
    const out = html(source)
    expect(out).toContain('<th style="text-align:center"')
    expect(out).toContain('<strong>Aufträge</strong>')
    expect(out).not.toContain('|---')
    // bars without a rule under them, and a rule of another width, are text as before
    expect(parseBlocks('A | B\nC | D').map((b) => b.type)).toEqual(['p'])
    expect(parseBlocks('A | B\n---').map((b) => b.type)).toEqual(['p'])
    expect(parseBlocks('| A |\n|---|\n| eins |')[0]).toEqual({ type: 'table', head: ['A'], align: [null], rows: [['eins']] })
    expect(plainLine('| Wann | Thema |\n|---|---|')).toBe('Wann · Thema')
    // a head of empty cells says nothing: the first row does
    expect(plainLine('| | |\n|---|---|\n| eins | zwei |')).toBe('eins · zwei')
    // bars outside a table are the text's, and a bar typed in a cell is a bar
    expect(plainLine('Entweder | oder')).toBe('Entweder | oder')
    expect(plainLine('`a || b`')).toBe('a || b')
    expect(plainLine('| Raum 1 \\| 2 | x |\n|---|---|')).toBe('Raum 1 | 2 · x')
  })

  it('keeps every cell of a row, and ends a table where something else begins', () => {
    // a row longer than the head widens the table
    expect(parseBlocks('| Zeit | Was |\n|---|---|\n| 9:00 | Start | Raum 2 |')[0]).toEqual({ type: 'table', head: ['Zeit', 'Was', ''], align: [null, null, null], rows: [['9:00', 'Start', 'Raum 2']] })
    expect(html('| Zeit | Was |\n|---|---|\n| 9:00 | Start | Raum 2 |')).toContain('Raum 2')
    // a heading, a list and a quote under a table are themselves, also with a bar in them
    const parsed = parseBlocks('| A | B |\n|---|---|\n| 1 | 2 |\n## Weiter | hier\n- punkt | zwei\n> gesagt | so')
    expect(parsed.map((b) => b.type)).toEqual(['table', 'h', 'ul', 'quote'])
    expect(parsed[0]).toMatchObject({ rows: [['1', '2']] })
    // the head stands on its rule, the cells at the top of their row
    const out = html('| A | B |\n|---|---|\n| 1 | 2 |')
    expect(out).toMatch(/<th[^>]*class="[^"]*align-bottom/)
    expect(out).not.toMatch(/<th[^>]*class="[^"]*align-top/)
    expect(out).toMatch(/<td[^>]*class="[^"]*align-top/)
  })

  it('gives a table as lines where no table can stand', () => {
    expect(tablesAsLines('Kern\n| Wann | **Was** |\n|---|---|\n| 9:00 | Start \\| Raum |\n|  | allein |\nDanach | so')).toBe('Kern\n**Wann · Was**\n9:00 · Start | Raum\nallein\nDanach · so')
    expect(tablesAsLines('Ohne | Tabelle\n- [ ] bleibt')).toBe('Ohne | Tabelle\n- [ ] bleibt')
  })

  it('reads a quote, and what it holds as notes again', () => {
    const parsed = parseBlocks('## Sprechfassung\n> „Schön, dass wir da sind.\n> Zweite Zeile.\n\n**Rückblick**\n> - eins\n> - zwei')
    expect(parsed.map((b) => b.type)).toEqual(['h', 'quote', 'p', 'quote'])
    expect(parsed[1]).toEqual({ type: 'quote', blocks: [{ type: 'p', lines: ['„Schön, dass wir da sind.', 'Zweite Zeile.'] }] })
    expect(parsed[3]).toEqual({ type: 'quote', blocks: [{ type: 'ul', items: ['eins', 'zwei'] }] })
    const out = html('> **Heute** mutig\n\nDanach')
    expect(out).toContain('<blockquote')
    expect(out).toContain('<strong>Heute</strong> mutig')
    expect(out).not.toContain('&gt;')
    // a quote is not one plain line: a note sets it below its title
    expect(oneLine('> zitiert')).toBe(null)
    // "more than" stays as typed: no space after the sign, or a number after it
    expect(parseBlocks('>5 Personen: teilen\n\n> 10 Minuten\n\n>ohne Abstand')).toEqual([{ type: 'p', lines: ['>5 Personen: teilen'] }, { type: 'p', lines: ['> 10 Minuten'] }, { type: 'p', lines: ['>ohne Abstand'] }])
    expect(html('> 10 Minuten')).toContain('&gt; 10 Minuten')
    // inside a quote that has begun, a line with a number goes on with it
    expect(parseBlocks('> Drei Dinge:\n> 3 Fragen, 2 Antworten\n>\n> Ende')).toEqual([{ type: 'quote', blocks: [{ type: 'p', lines: ['Drei Dinge:', '3 Fragen, 2 Antworten'] }, { type: 'p', lines: ['Ende'] }] }])
    // thousands of signs in one line are text below the depth that is read, not a crash
    const deep = parseBlocks('> '.repeat(20000) + 'tief')
    let levels = 0
    for (let b = deep[0]; b?.type === 'quote'; b = b.blocks[0]) levels++
    expect(levels).toBe(4)
    expect(() => html('>'.repeat(20000) + ' x')).not.toThrow()
    expect(plainLine('> > **gesagt**')).toBe('gesagt')
  })

  it('never lets HTML or script links through', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> [klick](javascript:alert(1)) [data](data:text/html,x)')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('href="data:')
    expect(out).toContain('&lt;script&gt;')
  })
})
