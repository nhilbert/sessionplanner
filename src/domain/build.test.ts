import { describe, expect, it } from 'vitest'
import { buildOf, buildStages, stepFrom, withBuildClass } from './build.ts'
import { SLIDE_LAYOUTS } from './slideFormat.ts'
import { normalizeSlideHtml, sanitizeSlide, slideLayout } from './slides.ts'

const example = (layout: string): string => SLIDE_LAYOUTS.find((l) => l.layout === layout)!.example
const building = (html: string): string => html.replace(/^<section class="([^"]*)"/, (_, c: string) => `<section class="${withBuildClass(c, true)}"`)
/** The stage every numbered element comes with, in the order of the markup. */
const marks = (html: string): number[] => [...html.matchAll(/ data-b="(\d+)"/g)].map((m) => Number(m[1]))

describe('the stages of a slide', () => {
  it('has none without the class, whatever the layout', () => {
    for (const l of SLIDE_LAYOUTS) {
      expect(buildStages(l.example), l.layout).toBe(0)
      expect(buildOf(l.example).html, l.layout).toBe(l.example)
    }
  })

  it('counts the units of every layout that builds, from the catalogue’s own examples', () => {
    const stages = Object.fromEntries(SLIDE_LAYOUTS.map((l) => [l.layout, buildStages(building(l.example))]))
    expect(stages).toMatchObject({
      list: 3, // three points; the sub-point comes with its point
      cards: 3,
      steps: 3,
      timeline: 4,
      exercise: 3, // the steps; the facts stand
      compare: 2,
      acronym: 5,
      canvas: 5,
      table: 2, // the rows of the body; the head stands
      agenda: 4,
      split: 2, // the lead and the list beside the picture
      statement: 1, // the line under the sentence
      quote: 1, // who said it, as one
      number: 1,
    })
    // nothing to build, or not yet
    for (const layout of ['title', 'break', 'closing', 'figure', 'model', 'diagram', 'matrix', 'section']) expect(stages[layout], layout).toBe(0)
  })

  it('numbers the units in reading order and leaves the rest of the markup as it stands', () => {
    const slide = building(example('cards'))
    const built = buildOf(slide)
    expect(built.stages).toBe(3)
    expect(marks(built.html)).toEqual([1, 2, 3])
    expect(built.html.replace(/ data-b="\d+"/g, '')).toBe(slide)
    expect(built.html).toContain('<li data-b="1"><h3>Wertschätzung</h3>')
  })

  it('brings a point with its sub-points', () => {
    const built = buildOf(building(example('list')))
    expect(marks(built.html)).toEqual([1, 2, 3])
    expect(built.html).toContain('<li data-b="2">Ich-Botschaften<ul><li>„Ich habe bemerkt')
  })

  it('brings who said a quotation as one stage', () => {
    const built = buildOf(building(example('quote')))
    expect(built.stages).toBe(1)
    expect(built.html).toContain('<p data-b="1" class="sub">')
    expect(built.html).toContain('<cite data-b="1">')
  })

  it('makes the takeaway a last stage of its own, and leaves the source standing', () => {
    const slide = '<section class="slide list build"><header><h2>Regeln</h2></header><ul class="list"><li>Eins</li><li>Zwei</li></ul><footer><span class="takeaway">Darum</span><span class="source">Quelle</span></footer></section>'
    const built = buildOf(slide)
    expect(built.stages).toBe(3)
    expect(built.html).toContain('<span data-b="3" class="takeaway">')
    expect(built.html).toContain('<span class="source">Quelle</span>')
  })

  it('does not build a slide for its takeaway alone', () => {
    expect(buildStages('<section class="slide figure build"><header><h2>Bild</h2></header><figure class="main"><img src="asset:3f2a9c1e5b7d4a6f" alt=""></figure><footer><span class="takeaway">Darum</span></footer></section>')).toBe(0)
  })

  it('never lets a slide come on empty: without a header the first unit comes with the slide', () => {
    const built = buildOf('<section class="slide list build"><ul class="list"><li>Eins</li><li>Zwei</li><li>Drei</li></ul></section>')
    expect(built.stages).toBe(2)
    expect(built.html).toContain('<li>Eins</li><li data-b="1">Zwei</li><li data-b="2">Drei</li>')
    // an empty header shows nothing either
    expect(buildStages('<section class="slide list build"><header></header><ul class="list"><li>Eins</li><li>Zwei</li></ul></section>')).toBe(1)
    // a picture beside the points stands
    expect(buildStages('<section class="slide list build"><ul class="list"><li>Eins</li><li>Zwei</li></ul><figure class="aside"><img src="asset:3f2a9c1e5b7d4a6f" alt=""></figure></section>')).toBe(2)
  })

  it('reads the rows of a table without a tbody, and the points of a section slide', () => {
    expect(buildStages('<section class="slide table build"><header><h2>T</h2></header><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table></section>')).toBe(2)
    expect(buildStages('<section class="slide section build"><div class="text"><h1>Teil 2</h1><ul class="list"><li>Eins</li><li>Zwei</li></ul></div></section>')).toBe(2)
  })

  it('keeps entities and attributes as they were written', () => {
    const slide = '<section class="slide list build"><header><h2>Caf&eacute; &amp; Kuchen</h2></header><ul class="list compact"><li class="accent">A &lt; B</li><li>„Zwei“</li></ul></section>'
    const built = buildOf(slide)
    expect(built.html).toBe('<section class="slide list build"><header><h2>Caf&eacute; &amp; Kuchen</h2></header><ul class="list compact"><li data-b="1" class="accent">A &lt; B</li><li data-b="2">„Zwei“</li></ul></section>')
  })

  it('is read from what the sanitiser stores, and its numbers do not survive the sanitiser', () => {
    const stored = normalizeSlideHtml(building(example('steps')))
    expect(stored).toContain('class="slide steps build"')
    const built = buildOf(stored)
    expect(built.stages).toBe(3)
    expect(sanitizeSlide(built.html)).toBe(stored)
  })

  it('reads a table row that begins with its label as a row of the body', () => {
    const rows = '<tr><th></th><th>A</th><th>B</th></tr><tr><th>R1</th><td>1</td><td>2</td></tr><tr><th>R2</th><td>3</td><td>4</td></tr>'
    expect(buildStages(`<section class="slide table build"><header><h2>T</h2></header><table>${rows}</table></section>`)).toBe(2)
  })

  it('knows the layout wherever the class stands', () => {
    const cards = example('cards')
    expect(buildStages(cards.replace('class="slide cards"', 'class="slide build cards"'))).toBe(3)
    expect(slideLayout(cards.replace('class="slide cards"', 'class="slide build cards"'))).toBe('cards')
  })

  it('only counts the class on the slide itself', () => {
    expect(buildStages('<section class="slide list"><ul class="list build"><li>Eins</li><li>Zwei</li></ul></section>')).toBe(0)
    expect(buildStages('<section class="slide list rebuild"><header><h2>T</h2></header><ul class="list"><li>Eins</li></ul></section>')).toBe(0)
  })
})

describe('the class on the root', () => {
  it('is added once and taken away, with the other classes kept', () => {
    expect(withBuildClass('slide cards', true)).toBe('slide cards build')
    expect(withBuildClass('slide cards build', true)).toBe('slide cards build')
    expect(withBuildClass('slide title build pic-band', false)).toBe('slide title pic-band')
  })
})

describe('stepping through a deck', () => {
  // three slides: without a build, with three stages, with one
  const counts = [0, 3, 1]

  it('brings the next stage, then the next slide at its first', () => {
    expect(stepFrom(counts, 0, 0, 1)).toEqual({ at: 1, stage: 0 })
    expect(stepFrom(counts, 1, 0, 1)).toEqual({ at: 1, stage: 1 })
    expect(stepFrom(counts, 1, 3, 1)).toEqual({ at: 2, stage: 0 })
    expect(stepFrom(counts, 2, 0, 1)).toEqual({ at: 2, stage: 1 })
  })

  it('stays at the end of the last slide', () => {
    expect(stepFrom(counts, 2, 1, 1)).toEqual({ at: 2, stage: 1 })
    expect(stepFrom(counts, 0, 0, -1)).toEqual({ at: 0, stage: 0 })
  })

  it('takes the last stage away, and goes to the slide before whole', () => {
    expect(stepFrom(counts, 1, 2, -1)).toEqual({ at: 1, stage: 1 })
    expect(stepFrom(counts, 2, 0, -1)).toEqual({ at: 1, stage: 3 })
    expect(stepFrom(counts, 1, 0, -1)).toEqual({ at: 0, stage: 0 })
  })

  it('pages whole slides when asked to', () => {
    expect(stepFrom(counts, 1, 1, 1, true)).toEqual({ at: 2, stage: 0 })
    expect(stepFrom(counts, 2, 1, -1, true)).toEqual({ at: 1, stage: 3 })
  })

  it('reads a stage beyond the slide’s own as its last (the slide lost a point meanwhile)', () => {
    expect(stepFrom(counts, 1, 7, 1)).toEqual({ at: 2, stage: 0 })
    expect(stepFrom(counts, 1, 7, -1)).toEqual({ at: 1, stage: 2 })
  })
})
