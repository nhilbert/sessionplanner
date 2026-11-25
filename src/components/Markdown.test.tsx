import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { oneLine, parseBlocks, plainLine, sourceOffset } from '@/domain/markdown'
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

  it('never lets HTML or script links through', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> [klick](javascript:alert(1)) [data](data:text/html,x)')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('href="data:')
    expect(out).toContain('&lt;script&gt;')
  })
})
