import { describe, expect, it } from 'vitest'
import { boldPatch, foldSpaces, formatRuns, nodesToRuns, rangeState, runsLength, runsToNodes, sizePatch, trimBreaks } from './inlineRuns'
import { inlineToText, parseTree, serializeNodes, textToInline } from './slideTree'

const runs = (html: string) => nodesToRuns(parseTree(html))
const html = (r: ReturnType<typeof runs>) => serializeNodes(runsToNodes(r))
/** What the fields would show, and whether they read it back as the same markup. */
const field = (markup: string) => {
  const text = inlineToText(parseTree(markup))
  expect(serializeNodes(textToInline(text)), markup).toBe(markup)
  return text
}

describe('inline runs', () => {
  it('reads elements as runs and builds the same elements again', () => {
    for (const markup of [
      'Nur Text',
      'Ein <strong>fettes</strong> und ein <em>kursives</em> Wort',
      '<span class="fs-l c-accent-2">Groß <strong>und fett</strong></span> danach',
      'Zeile eins<br>Zeile <span class="accent">zwei</span>',
      '<span class="tag">Übung</span> Titel <small>1/2</small>',
      '<strong><em>beides</em></strong>',
    ])
      expect(html(runs(markup)), markup).toBe(markup)
  })
  it('formats a stretch: the runs are split at its ends', () => {
    const r = runs('Ein lautes Wort')
    expect(html(formatRuns(r, 4, 10, { weight: 'bold' }))).toBe('Ein <strong>lautes</strong> Wort')
    expect(html(formatRuns(r, 4, 10, { size: 'l', color: 'accent-2' }))).toBe('Ein <span class="fs-l c-accent-2">lautes</span> Wort')
    expect(html(formatRuns(r, 0, runsLength(r), { italic: true }))).toBe('<em>Ein lautes Wort</em>')
    // inside a word, which the fields write in brackets
    const inWord = html(formatRuns(runs('Teilnehmer'), 0, 4, { weight: 'bold' }))
    expect(inWord).toBe('<strong>Teil</strong>nehmer')
    expect(field(inWord)).toBe('[Teil]{b}nehmer')
  })
  it('lays formats over each other and takes them back', () => {
    let r = formatRuns(runs('Ein lautes Wort'), 0, 15, { size: 'l' })
    r = formatRuns(r, 4, 10, { color: 'accent-3', weight: 'bold' })
    expect(html(r)).toBe('<span class="fs-l">Ein </span><span class="fs-l c-accent-3"><strong>lautes</strong></span><span class="fs-l"> Wort</span>')
    // the fields put the spaces at the spans' edges outside them, which shows the same
    const written = inlineToText(runsToNodes(r))
    expect(written).toBe('[Ein]{l} [**lautes**]{l accent-3} [Wort]{l}')
    expect(inlineToText(textToInline(written))).toBe(written)
    r = formatRuns(r, 0, 15, { size: null })
    expect(html(r)).toBe('Ein <span class="c-accent-3"><strong>lautes</strong></span> Wort')
    expect(html(formatRuns(r, 0, 15, { clear: true }))).toBe('Ein lautes Wort')
  })
  it('keeps a space between two formatted words plain, and code through a clear', () => {
    let r = formatRuns(runs('a b'), 0, 1, { weight: 'bold' })
    r = formatRuns(r, 1, 2, { italic: true })
    expect(html(r)).toBe('<strong>a</strong> b')
    expect(html(formatRuns(runs('<strong>a <code>b</code></strong>'), 0, 3, { clear: true }))).toBe('a <code>b</code>')
  })
  it('leaves islands and line breaks alone, each one position', () => {
    const r = runs('<span class="tag">Übung</span> Titel<br>zwei')
    expect(runsLength(r)).toBe(1 + ' Titel'.length + 1 + 'zwei'.length)
    expect(html(formatRuns(r, 0, runsLength(r), { size: 'xl' }))).toBe('<span class="tag">Übung</span><span class="fs-xl"> Titel</span><br><span class="fs-xl">zwei</span>')
  })
  it('says what a stretch carries, against what the theme does', () => {
    const r = runs('Ein <strong>lautes</strong> <span class="fs-l">Wort</span>')
    expect(rangeState(r, 4, 10, false)).toEqual({ bold: true, italic: false, size: '', color: '', formatted: true })
    expect(rangeState(r, 0, 15, false)).toMatchObject({ bold: false, size: 'mixed', formatted: true })
    expect(rangeState(r, 0, 3, false).formatted).toBe(false)
    // a heading the theme sets bold: plain words are bold, and "bold off" writes `normal`
    const head = runs('Titel')
    const state = rangeState(head, 0, 5, true)
    expect(state.bold).toBe(true)
    expect(boldPatch(state, true)).toEqual({ weight: 'normal' })
    const off = formatRuns(head, 0, 5, boldPatch(state, true))
    expect(html(off)).toBe('<span class="fw-normal">Titel</span>')
    expect(boldPatch(rangeState(off, 0, 5, true), true)).toEqual({ weight: null })
    expect(boldPatch(rangeState(head, 0, 5, false), false)).toEqual({ weight: 'bold' })
  })
  it('steps the size up and down and stops at the ends', () => {
    const base = rangeState(runs('x'), 0, 1, false)
    expect(sizePatch(base, 1)).toEqual({ size: 'l' })
    expect(sizePatch(base, -1)).toEqual({ size: 's' })
    expect(sizePatch({ ...base, size: 'l' }, -1)).toEqual({ size: null })
    expect(sizePatch({ ...base, size: 'xl' }, 1)).toEqual({ size: 'xl' })
    expect(sizePatch({ ...base, size: 'mixed' }, 1)).toEqual({ size: 'l' })
  })
  it('folds whitespace for editing and trims line breaks for storing', () => {
    expect(html(foldSpaces(runs('  Text  über\n   <strong> zwei </strong>  Zeilen <br>  und mehr  ')))).toBe('Text über <strong>zwei </strong>Zeilen<br>und mehr')
    expect(html(trimBreaks(runs('<br>a<br>b<br><br>')))).toBe('a<br>b')
  })
})
