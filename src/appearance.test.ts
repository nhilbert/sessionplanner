/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Read from disk: Vitest hands CSS imports over empty, ?raw included.
const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

/** The declarations of the first rule opened by `opening`, without indentation. */
function declarations(opening: string): string[] {
  const start = css.indexOf(opening)
  expect(start).toBeGreaterThan(-1)
  const body = css.slice(start + opening.length, css.indexOf('}', start))
  return body.split('\n').map((l) => l.trim()).filter(Boolean)
}

describe('the dark tokens', () => {
  it('are the same whether the system asks for dark or the device chose it', () => {
    const bySystem = declarations(':root:not([data-appearance="light"]) {')
    const chosen = declarations(':root[data-appearance="dark"] {')
    expect(bySystem.length).toBeGreaterThan(20)
    expect(chosen).toEqual(bySystem)
  })
})
