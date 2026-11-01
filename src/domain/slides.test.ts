import { describe, expect, it } from 'vitest'
import { normalizeSlideHtml, renderSlideHtml, sanitizeSlide, slideAssets, slideLayout, slideText, slideTitle } from './slides.ts'

describe('sanitizeSlide', () => {
  it('keeps the format and drops what is not in it', () => {
    const html = '<section class="slide cards"><header><h2>Titel</h2></header><ul class="cards cols-2"><li><h3>A</h3><p>Text &amp; mehr</p></li></ul></section>'
    expect(sanitizeSlide(html)).toBe(html)
  })
  it('removes scripts, styles, handlers and foreign addresses', () => {
    expect(sanitizeSlide('<section class="slide list"><script>alert(1)</script><p onclick="x()" style="color:red">Hallo</p><iframe src="https://evil"></iframe></section>')).toBe(
      '<section class="slide list"><p>Hallo</p></section>',
    )
    expect(sanitizeSlide('<p><a href="https://example.com">Link</a></p>')).toBe('<p>Link</p>')
    expect(sanitizeSlide('<img src="https://example.com/x.png"><img src="asset:0123456789abcdef" alt="x">')).toBe('<img><img src="asset:0123456789abcdef" alt="x">')
    expect(sanitizeSlide('<p class="x" data-x="1" id="y" title="t">a</p>')).toBe('<p class="x">a</p>')
  })
  it('keeps the SVG subset with theme colours and refuses the rest', () => {
    const svg = '<svg viewBox="0 0 100 100"><rect class="f-accent" x="0" y="0" width="50" height="50" rx="4"/><text class="t" x="10" y="20">A</text><path d="M0 0 L10 10 Z" fill="var(--accent)" stroke="none"/></svg>'
    expect(sanitizeSlide(svg)).toBe('<svg viewBox="0 0 100 100"><rect class="f-accent" x="0" y="0" width="50" height="50" rx="4"></rect><text class="t" x="10" y="20">A</text><path d="M0 0 L10 10 Z" fill="var(--accent)" stroke="none"></path></svg>')
    expect(sanitizeSlide('<svg><use href="#x"/><foreignObject><div>x</div></foreignObject><rect fill="url(#g)" x="1"/><style>*{}</style><a href="x"><text>t</text></a></svg>')).toBe('<svg><rect x="1"></rect><text>t</text></svg>')
    expect(sanitizeSlide('<svg viewbox="0 0 1 1"><circle cx="1" cy="1" r="1" onload="x()"/></svg>')).toBe('<svg viewBox="0 0 1 1"><circle cx="1" cy="1" r="1"></circle></svg>')
  })
  it('closes what was left open and ignores stray closing tags', () => {
    expect(sanitizeSlide('<section class="slide list"><ul><li>a<li>b</ul></p>')).toBe('<section class="slide list"><ul><li>a<li>b</li></li></ul></section>')
    expect(sanitizeSlide('<p>1 < 2 and 3 > 2</p>')).toBe('<p>1 &lt; 2 and 3 &gt; 2</p>')
    expect(sanitizeSlide('<p>a<!-- comment --><b>b</b></p>')).toBe('<p>ab</p>')
  })
  it('drops attribute values that could do harm', () => {
    expect(sanitizeSlide('<p class="a&quot;b">x</p>')).toBe('<p>x</p>')
    expect(sanitizeSlide('<svg><rect fill="javascript:x"/></svg>')).toBe('<svg><rect></rect></svg>')
    expect(sanitizeSlide('<svg><g transform="translate(10, 20) rotate(45)"/></svg>')).toBe('<svg><g transform="translate(10, 20) rotate(45)"></g></svg>')
  })
})

describe('slide helpers', () => {
  it('normalises a root', () => {
    expect(normalizeSlideHtml('<p>only text</p>')).toBe('<section class="slide list"><p>only text</p></section>')
    expect(normalizeSlideHtml('<section class="slide quote"><blockquote><p>q</p></blockquote></section>')).toBe('<section class="slide quote"><blockquote><p>q</p></blockquote></section>')
  })
  it('finds assets, layout, text and title', () => {
    const html = '<section class="slide split"><header><h2>Selbstwirksamkeit</h2></header><figure><img src="asset:0123456789abcdef"></figure><svg><text>hidden</text></svg></section>'
    expect(slideAssets(html)).toEqual(['0123456789abcdef'])
    expect(slideLayout(html)).toBe('split')
    expect(slideText(html)).toBe('Selbstwirksamkeit')
    expect(slideTitle(html)).toBe('Selbstwirksamkeit')
    expect(slideTitle('<section class="slide statement"><div class="text"><p class="big">Stress entsteht.</p></div></section>')).toBe('Stress entsteht.')
    expect(renderSlideHtml(html, (h) => `/api/x/${h}`)).toContain('src="/api/x/0123456789abcdef"')
  })
})
