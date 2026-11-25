import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { oneLine, parseBlocks } from '@/domain/markdown'
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

  it('never lets HTML or script links through', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> [klick](javascript:alert(1)) [data](data:text/html,x)')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('href="data:')
    expect(out).toContain('&lt;script&gt;')
  })
})
