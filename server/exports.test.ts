import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import { filePaths } from './storage.ts'
import { dataZip, mediaZip, safePart, workshopZip } from './exports.ts'
import { zipStream } from './zipStream.ts'
import { readZip } from '../src/slides/unzip.ts'
import { DEFAULT_TOKENS } from '../src/domain/theme.ts'
import type { Item } from '../src/domain/types.ts'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const HASH = 'a'.repeat(64)
const CUT = 'b'.repeat(64)

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'sp-export-'))
  dirs.push(root)
  const filesDir = path.join(root, 'files')
  const themesDir = path.join(root, 'themes')
  const p = filePaths(filesDir)
  mkdirSync(p.assetsDir, { recursive: true })
  const repo = new Repo(openDb(':memory:'))
  const ws = repo.createWorkshop({ title: 'Teamtag: Planung/2027', client: 'Beispiel GmbH', date: '2026-11-10' })
  const id = ws.workshop.id
  const day = ws.days[0].id
  writeFileSync(p.asset(HASH), 'png-bytes')
  writeFileSync(p.asset(CUT), 'cut-bytes')
  repo.addAsset({ hash: HASH, mime: 'image/png', size: 9 })
  repo.addAsset({ hash: CUT, mime: 'image/png', size: 9, cutoutOf: HASH })
  const item: Item = { id: 'i1', workshopId: id, dayId: day, position: 1, groupId: null, kind: 'block', title: 'Einstieg', description: '', duration: 30, fixedStart: null, goal: '', method: '', lead: '', notes: 'leise', materials: [], attachmentIds: ['f1', 'f2'], slides: [{ id: 's1', html: `<section class="slide figure"><figure class="main"><img src="asset:${CUT}"></figure></section>` }], categoryId: null, color: null }
  repo.applyOps(id, [{ op: 'create', entity: 'item', record: item }])
  for (const [fid, name] of [['f1', 'Ablauf.pdf'], ['f2', 'Ablauf.pdf'], ['f3', 'fehlt.pdf']]) {
    if (fid !== 'f3') writeFileSync(p.file(fid), `${fid}-bytes`)
    repo.addAttachment(id, { id: fid, name, mime: 'application/pdf', size: 8 })
  }
  repo.setMember(id, 'gast@example.com', 'view', false)
  return { repo, filesDir, themesDir, id, p }
}

async function unpack(stream: ReadableStream<Uint8Array>): Promise<Map<string, string>> {
  const files = await readZip(new Uint8Array(await new Response(stream).arrayBuffer()))
  return new Map([...files].map(([k, v]) => [k, new TextDecoder().decode(v)]))
}

describe('the export of a workshop', () => {
  it('holds the record, its files under their names and the pictures its slides show', async () => {
    const { repo, filesDir, id } = setup()
    const files = await unpack(workshopZip(repo, filesDir, id)!)
    expect([...files.keys()].sort()).toEqual(['files/Ablauf (2).pdf', 'files/Ablauf.pdf', 'pictures/' + HASH + '.png', 'pictures/' + CUT + '.png', 'workshop.json'])
    expect(files.get('files/Ablauf.pdf')).toBe('f1-bytes')
    expect(files.get('files/Ablauf (2).pdf')).toBe('f2-bytes')
    const record = JSON.parse(files.get('workshop.json')!)
    expect(record).toMatchObject({ format: 'session-planner/workshop', version: 1, workshop: { id, title: 'Teamtag: Planung/2027' } })
    expect(record.items[0]).toMatchObject({ id: 'i1', notes: 'leise' })
    expect(record.members).toMatchObject([{ email: 'gast@example.com', role: 'view' }])
    expect(record.attachments.map((a: { id: string; file: string | null }) => [a.id, a.file])).toEqual([['f1', 'files/Ablauf.pdf'], ['f2', 'files/Ablauf (2).pdf'], ['f3', null]])
    expect(record.pictures.map((a: { hash: string }) => a.hash).sort()).toEqual([HASH, CUT])
  })

  it('is null for a workshop that does not exist', () => {
    const { repo, filesDir } = setup()
    expect(workshopZip(repo, filesDir, 'nope')).toBeNull()
  })
})

describe('the export of all data', () => {
  it('holds every record as JSON and no media', async () => {
    const { repo, id } = setup()
    repo.saveLibraryEntry(null, { kind: 'item', title: 'Fishbowl', data: { kind: 'block', title: 'Fishbowl', description: '', duration: 30, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [], slides: [], categoryId: null, color: null } })
    repo.createTheme({ id: 'firma', name: 'Firma', tokens: DEFAULT_TOKENS })
    repo.createDeck({ title: 'Resilienz', theme: 'firma', source: 'resilienz.pptx', slides: [{ html: '<p>eins</p>', caption: '' }] })
    const files = await unpack(dataZip(repo))
    const names = [...files.keys()]
    expect(names.filter((n) => !n.startsWith('workshops/')).sort()).toEqual(['assets.json', 'decks.json', 'library.json', 'manifest.json', 'settings.json', 'slide-templates.json', 'themes.json'])
    const manifest = JSON.parse(files.get('manifest.json')!)
    expect(manifest).toMatchObject({ format: 'session-planner/data', counts: { workshops: 1, library: 1, decks: 1, themes: 1, assets: 2 } })
    expect(manifest.workshops[0].file).toBe(`workshops/Teamtag_ Planung_2027 – ${id.slice(0, 8)}.json`)
    expect(JSON.parse(files.get(manifest.workshops[0].file)!).items[0].id).toBe('i1')
    expect(JSON.parse(files.get('decks.json')!)[0].slides[0].html).toBe('<p>eins</p>')
    expect(JSON.parse(files.get('themes.json')!)[0]).toMatchObject({ id: 'firma', pool: [] })
    expect(names.some((n) => n.endsWith('.pdf') || n.endsWith('.png'))).toBe(false)
  })
})

describe('the export of all media', () => {
  it('holds every file with an index that ties it to its records, and names what was missing', async () => {
    const { repo, filesDir, themesDir, id, p } = setup()
    const entry = repo.saveLibraryEntry(null, { kind: 'item', title: 'Fishbowl', data: { kind: 'block', title: 'Fishbowl', description: '', duration: 30, goal: '', method: '', lead: '', notes: '', materials: [], attachmentIds: [], slides: [], categoryId: null, color: null } })!
    writeFileSync(p.file('l1'), 'l1-bytes')
    repo.addLibraryAttachment(entry.id, 0, { id: 'l1', name: 'Anleitung.md', mime: 'text/markdown', size: 8 })
    repo.createTheme({ id: 'firma', name: 'Firma', tokens: DEFAULT_TOKENS })
    mkdirSync(p.themeFilesDir('firma'), { recursive: true })
    mkdirSync(path.join(p.themeFilesDir('firma'), 'fonts'))
    writeFileSync(p.themeFile('firma', 'fonts/x.woff2'), 'font')
    repo.setThemeFile('firma', 'fonts/x.woff2', { mime: 'font/woff2', size: 4, updatedAt: '2026-01-01T00:00:00Z' })
    mkdirSync(p.themeLogosDir, { recursive: true })
    writeFileSync(p.themeLogo('firma', 'logo'), '<svg/>')
    repo.setThemeLogo('firma', 'logo', { mime: 'image/svg+xml', updatedAt: '2026-01-01T00:00:00Z' })
    mkdirSync(path.join(themesDir, 'ordner', 'fonts'), { recursive: true })
    writeFileSync(path.join(themesDir, 'ordner', 'theme.css'), ':root{}')
    writeFileSync(path.join(themesDir, 'ordner', 'fonts', 'a.ttf'), 'ttf')

    const files = await unpack(mediaZip(repo, filesDir, themesDir))
    expect([...files.keys()].sort()).toEqual([
      'attachments/Teamtag_ Planung_2027/Ablauf (2).pdf',
      'attachments/Teamtag_ Planung_2027/Ablauf.pdf',
      'library/Fishbowl/Anleitung.md',
      'media.json',
      `pictures/${HASH}.png`,
      `pictures/${CUT}.png`,
      'theme-files/firma/fonts/x.woff2',
      'theme-logos/firma.svg',
      'themes/ordner/fonts/a.ttf',
      'themes/ordner/theme.css',
    ].sort())
    const index = JSON.parse(files.get('media.json')!)
    expect(index.files).toContainEqual({ file: 'attachments/Teamtag_ Planung_2027/Ablauf.pdf', kind: 'attachment', id: 'f1', workshopId: id, name: 'Ablauf.pdf', mime: 'application/pdf', size: 8 })
    expect(index.files).toContainEqual(expect.objectContaining({ file: 'library/Fishbowl/Anleitung.md', kind: 'library-attachment', entryId: entry.id }))
    expect(index.missing).toEqual([{ kind: 'attachment', id: 'f3', workshopId: id, name: 'fehlt.pdf', mime: 'application/pdf' }])
  })
})

const hasPython = (() => {
  try {
    execFileSync('python3', ['--version'])
    return true
  } catch {
    return false
  }
})()

describe('the ZIP writer', () => {
  async function* parts() {
    yield { path: 'a.json', data: '{"x":1}'.repeat(100), compress: true }
    yield { path: 'ordner/b.bin', data: Uint8Array.of(1, 2, 3) }
  }

  it.skipIf(!hasPython)('writes an archive other programs read too, with the ZIP64 records once it grows past 32 bits', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'sp-zip-'))
    dirs.push(root)
    for (const [name, zip64Over] of [['plain.zip', undefined], ['zip64.zip', 1]] as const) {
      const bytes = new Uint8Array(await new Response(zipStream(parts(), { zip64Over })).arrayBuffer())
      writeFileSync(path.join(root, name), bytes)
      const listed = execFileSync('python3', ['-I', '-c', 'import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(",".join(f"{i.filename}:{i.file_size}" for i in z.infolist()))', path.join(root, name)], { encoding: 'utf8' })
      expect(listed.trim()).toBe('a.json:700,ordner/b.bin:3')
    }
  })
})

describe('safePart', () => {
  it('keeps a name in one step of a path', () => {
    expect(safePart('../a/b\\c:d', 'x')).toBe('_a_b_c_d')
    expect(safePart(' .. ', 'x')).toBe('x')
    expect(safePart('Ablauf.pdf', 'x')).toBe('Ablauf.pdf')
  })
})
