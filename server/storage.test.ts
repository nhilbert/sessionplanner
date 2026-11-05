import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { dataPaths, filePaths, themeFolderFile } from './storage.ts'

describe('where data lies', () => {
  // Both instances hold their data in these places: a change here moves files away from their records.
  it('keeps the layout of a data folder', () => {
    expect(dataPaths('data')).toEqual({ dbFile: 'data/sessions.db', backupDir: 'data/backups', filesDir: 'data/files', themesDir: 'data/themes' })
  })

  it('keeps the layout of the files folder', () => {
    const f = filePaths('data/files')
    expect(f.file('id')).toBe('data/files/id')
    expect(f.file('id.new')).toBe('data/files/id.new')
    expect(f.logo).toBe('data/files/logo')
    expect(f.assetsDir).toBe('data/files/assets')
    expect(f.asset('hash')).toBe('data/files/assets/hash')
    expect(f.darkAssetsDir).toBe('data/files/assets-dark')
    expect(f.darkAsset('hash')).toBe('data/files/assets-dark/hash')
    expect(f.themeLogosDir).toBe('data/files/theme-logos')
    expect(f.themeLogo('brand', 'logo')).toBe('data/files/theme-logos/brand')
    expect(f.themeLogo('brand', 'logoLight')).toBe('data/files/theme-logos/brand-light')
    expect(f.themeFilesDir('brand')).toBe('data/files/theme-files/brand')
    expect(f.themeFile('brand', 'fonts/a.woff2')).toBe('data/files/theme-files/brand/fonts/a.woff2')
  })

  it('keeps the layout of a theme folder', () => {
    expect(themeFolderFile('data/themes', 'brand', 'theme.css')).toBe('data/themes/brand/theme.css')
    expect(themeFolderFile('data/themes', 'brand', 'fonts', 'a.woff2')).toBe('data/themes/brand/fonts/a.woff2')
  })
})

describe('a name that would leave its folder', () => {
  const f = filePaths('data/files')
  const bad = ['.', '..', '../sessions.db', '../../other/sessions.db', '/etc/passwd', 'a/b', 'a\\b', '..\\x', 'a\0b', '']

  it.each(bad)('is refused as %j', (name) => {
    expect(() => f.file(name)).toThrow('Refused')
    expect(() => f.asset(name)).toThrow('Refused')
    expect(() => f.darkAsset(name)).toThrow('Refused')
    expect(() => f.themeLogo(name, 'logo')).toThrow('Refused')
    expect(() => f.themeFilesDir(name)).toThrow('Refused')
    expect(() => themeFolderFile('data/themes', name, 'theme.css')).toThrow('Refused')
    if (name !== '.') expect(() => themeFolderFile('data/themes', 'brand', name)).toThrow('Refused')
  })

  it('is refused anywhere in a theme file path', () => {
    for (const file of ['../x', 'fonts/../../x', 'fonts//x', '/x', 'x/', 'fonts/..']) expect(() => f.themeFile('brand', file), file).toThrow('Refused')
  })

  it('cannot reach the folder of all theme files', () => {
    expect(() => f.themeFilesDir('.')).toThrow('Refused')
    expect(() => f.themeFile('.', 'a.woff2')).toThrow('Refused')
  })

  it('leaves out a step that goes nowhere in the path of a folder theme, as it always has', () => {
    expect(themeFolderFile('data/themes', 'brand', '.', 'theme.css')).toBe('data/themes/brand/theme.css')
  })

  it('does not take ordinary names for one', () => {
    expect(f.file('a..b.woff2')).toBe('data/files/a..b.woff2')
    expect(f.themeFile('brand', 'my..font.woff2')).toBe('data/files/theme-files/brand/my..font.woff2')
  })
})

describe('storage.ts', () => {
  it('is the only file of the server that names these folders', () => {
    const dir = import.meta.dirname
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'storage.ts')
    expect(sources.length).toBeGreaterThan(10)
    const named = sources.filter((f) => /path\.join\([^)]*(filesDir|themesDir|dataDir|DATA_DIR|'(files|themes|backups|assets|assets-dark|theme-logos|theme-files|sessions\.db)')/.test(readFileSync(path.join(dir, f), 'utf8')))
    expect(named).toEqual([])
  })
})
