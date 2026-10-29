import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Markdown, { parseBlocks } from './Markdown'

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

  it('never lets HTML or script links through', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> [klick](javascript:alert(1)) [data](data:text/html,x)')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('href="data:')
    expect(out).toContain('&lt;script&gt;')
  })
})
