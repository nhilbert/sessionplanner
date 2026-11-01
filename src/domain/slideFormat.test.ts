import { describe, expect, it } from 'vitest'
import css from '../slides/slides.css?raw'
import { SLIDE_LAYOUTS } from './slideFormat.ts'
import { normalizeSlideHtml, slideLayout, slideTitle } from './slides.ts'

describe('slide format catalogue', () => {
  it('has an example per layout that the sanitiser leaves unchanged', () => {
    for (const l of SLIDE_LAYOUTS) {
      expect(normalizeSlideHtml(l.example), l.layout).toBe(l.example)
      expect(slideLayout(l.example)).toBe(l.layout)
      expect(slideTitle(l.example), l.layout).not.toBe('')
    }
  })
  it('covers every layout the stylesheet styles, once', () => {
    const styled = new Set([...css.matchAll(/\.slide\.([a-z]+)/g)].map((m) => m[1]))
    const documented = SLIDE_LAYOUTS.map((l) => l.layout)
    expect(new Set(documented).size).toBe(documented.length)
    for (const name of styled) expect(documented, `layout ${name} styled but not documented`).toContain(name)
  })
})
