import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SLIDE_FORMAT, SLIDE_LAYOUTS } from '../src/domain/slideFormat.ts'

/**
 * The stylesheet, the catalogue and the slide-build skill belong together: every layout the stylesheet styles is
 * in the catalogue, and the skill's copies (.claude/skills/slide-build, renewed by scripts/slides/refresh-skill.py)
 * are the current files. Read from disk: vitest hands an empty string for a stylesheet imported with ?raw.
 */
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel: string) => readFileSync(path.join(repo, rel), 'utf8')
const css = read('src/slides/slides.css')
const skill = '.claude/skills/slide-build'

describe('the stylesheet and the catalogue', () => {
  it('style and document the same layouts', () => {
    const styled = new Set([...css.matchAll(/\.slide\.([a-z]+)/g)].map((m) => m[1]))
    expect(styled.size).toBeGreaterThan(5)
    const documented = SLIDE_LAYOUTS.map((l) => l.layout)
    for (const name of styled) expect(documented, `layout ${name} styled but not documented`).toContain(name)
  })
})

describe('the stylesheet and builds (docs/slide-builds.md)', () => {
  const rules = css.slice(css.indexOf('builds (docs/slide-builds.md)'), css.indexOf('formatting laid over the theme'))

  it('lets the host’s marks hold against a theme’s own rules', () => {
    // A theme may set the same property on a unit with more weight than any rule of the stylesheet: the playful family
    // dims the line under a statement (opacity), a theme laid over an older stylesheet weighs its rules with an id.
    // Without !important such a unit looked shown in the presenter view while the room had not seen it yet.
    expect(rules).toMatch(/\.b-wait \{ visibility: hidden !important; \}/)
    expect(rules).toMatch(/\.b-ghost \{ opacity: 0\.\d+ !important; \}/)
    expect(rules).toMatch(/:has\(> \[data-b\]\.b-wait\) \{ border-bottom-color: transparent !important; \}/)
  })

  it('counts them on a screen only, so paper shows every slide whole whatever marks it carries', () => {
    const marks = [...rules.matchAll(/\.b-(wait|ghost|in)\b/g)]
    expect(marks.length).toBeGreaterThan(3)
    const screen = /@media not print \{\n([\s\S]*?)\n\}\n/.exec(rules)
    expect(screen).not.toBeNull()
    // every rule that hides or dims stands inside it
    expect(rules.replace(screen![0], '')).not.toMatch(/visibility|opacity: 0\.\d+ !important/)
    expect(rules).not.toMatch(/@media print/)
  })

  it('ends the motion of a stage once it has run', () => {
    // "both" or "forwards" keeps the animation on the element for good, and with it a layer of its own
    expect(rules).toMatch(/\.b-in \{ animation: slide-build-in \d+ms [^;]* backwards; \}/)
  })
})

describe('the slide-build skill', () => {
  it('carries the current stylesheet and default theme', () => {
    expect(read(`${skill}/assets/slides.css`)).toBe(css)
    expect(read(`${skill}/assets/themes/default.css`)).toBe(read('src/slides/themes/default.css'))
  })
  it('documents every rule and layout of the catalogue, with a rendering', () => {
    const md = read(`${skill}/reference/catalogue.md`)
    for (const [key, rule] of Object.entries(SLIDE_FORMAT)) {
      if (typeof rule === 'string') expect(md, key).toContain(rule)
    }
    for (const l of SLIDE_LAYOUTS) {
      expect(md, l.layout).toContain(`\n### ${l.layout}\n`)
      expect(md, l.layout).toContain(l.use)
      expect(md, l.layout).toContain(l.fits)
      expect(existsSync(path.join(repo, skill, 'reference/look', `${l.layout}.png`)), `${l.layout}.png`).toBe(true)
    }
  })
  it('names the tools and references it relies on', () => {
    const md = read(`${skill}/SKILL.md`)
    for (const rel of ['scripts/slides/check.py', 'scripts/slides/build.py', 'scripts/slides/render.sh', 'scripts/slides/refresh-skill.py']) {
      expect(md).toContain(rel)
      expect(existsSync(path.join(repo, rel)), rel).toBe(true)
    }
    for (const rel of ['reference/catalogue.md', 'reference/rendering.md']) expect(existsSync(path.join(repo, skill, rel)), rel).toBe(true)
  })
})
