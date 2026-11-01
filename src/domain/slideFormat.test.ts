import { describe, expect, it } from 'vitest'
import { SLIDE_LAYOUTS } from './slideFormat.ts'
import { normalizeSlideHtml, slideLayout, slideTitle } from './slides.ts'

// What the stylesheet styles and what the slide-build skill carries is checked in server/skill.test.ts, which reads the files.
describe('slide format catalogue', () => {
  it('has an example per layout that the sanitiser leaves unchanged', () => {
    for (const l of SLIDE_LAYOUTS) {
      expect(normalizeSlideHtml(l.example), l.layout).toBe(l.example)
      expect(slideLayout(l.example)).toBe(l.layout)
      expect(slideTitle(l.example), l.layout).not.toBe('')
    }
  })
  it('documents every layout once and says what fits on it', () => {
    const names = SLIDE_LAYOUTS.map((l) => l.layout)
    expect(new Set(names).size).toBe(names.length)
    for (const l of SLIDE_LAYOUTS) expect(l.fits.length, l.layout).toBeGreaterThan(20)
  })
})
