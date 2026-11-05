import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

describe('domain/addresses.ts', () => {
  const root = path.join(import.meta.dirname, '..')
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f)
      return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
    })

  it('is the only code of the client that writes the start of an address in the API', () => {
    const files = sources(path.join(root, 'src')).filter((f) => !f.endsWith(path.join('domain', 'addresses.ts')))
    expect(files.length).toBeGreaterThan(50)
    // Comments may name a route; a string may not.
    const written = files.filter((f) => /[`'"]\/api(\/|[`'"])/.test(readFileSync(f, 'utf8')))
    expect(written.map((f) => path.relative(root, f))).toEqual([])
  })

  it('gives the pages their address in new windows, and nothing reads the raw path of the page', () => {
    const files = sources(path.join(root, 'src'))
    const raw = files.filter((f) => /window\.open\(`\/|[^.\w]location\.pathname/.test(readFileSync(f, 'utf8')))
    expect(raw.map((f) => path.relative(root, f))).toEqual([])
  })

  it('is set only in the browser: a server process may hold several apps with a base path each', () => {
    const server = readdirSync(path.join(root, 'server')).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    expect(server.filter((f) => readFileSync(path.join(root, 'server', f), 'utf8').includes('setBasePath'))).toEqual([])
  })

  it('also writes the addresses the server puts into its answers', () => {
    expect(readFileSync(path.join(root, 'server', 'themes.ts'), 'utf8')).not.toMatch(/[`'"]\/api\//)
  })
})
