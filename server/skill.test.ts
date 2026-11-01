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
