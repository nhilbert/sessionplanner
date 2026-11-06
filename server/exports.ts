import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Repo } from './repo.ts'
import { filePaths, themeFolderFile } from './storage.ts'
import { folderThemes } from './themes.ts'
import { type ZipPart, zipStream } from './zipStream.ts'
import { clockIn } from '../src/domain/time.ts'
import { DEFAULT_TIMEZONE, type Asset, type Attachment, type Member, type WorkshopState } from '../src/domain/types.ts'

/**
 * Exports as ZIP archives, for the owner (README.md, Export as ZIP):
 * - one workshop with everything in it: its record, its files and the pictures its slides show;
 * - all data without the media: workshops, library, slide pool, themes, templates, settings, as JSON;
 * - all media on their own: files, pictures, theme files and logos, with an index that ties them to the data's ids.
 * The data and the media are apart because the media are what makes an archive large. Records are read when the
 * download starts; files one after the other while it runs. A file missing on disk is left out and named as missing.
 */

export const EXPORT_VERSION = 1

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' }
const extension = (mime: string) => EXTENSIONS[mime] ?? 'bin'

/** A name for one step of a path in the archive: no folders, nothing a file system refuses, not too long. */
export function safePart(name: string, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = name.replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').replace(/[. ]+$/, '')
  return clean.slice(0, 100) || fallback
}

/** The path, or with " (2)", " (3)" … before its extension when the archive has it already. */
function unique(taken: Set<string>, wanted: string): string {
  let candidate = wanted
  const dot = wanted.lastIndexOf('.')
  const slash = wanted.lastIndexOf('/')
  const [stem, ext] = dot > slash + 1 ? [wanted.slice(0, dot), wanted.slice(dot)] : [wanted, '']
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${ext}`
  taken.add(candidate.toLowerCase())
  return candidate
}

const json = (p: string, value: unknown): ZipPart => ({ path: p, data: `${JSON.stringify(value, null, 2)}\n`, compress: true })
const read = (file: string): Promise<Buffer | null> => readFile(file).catch(() => null)
const bytes = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.length)

/** Today in the workshops' time zone, for the names of the archives. */
export const exportDate = (at = new Date()) => clockIn(at, DEFAULT_TIMEZONE).date

/** A workshop as it is exported: its state (days, groups, items, attachment records) and who it is shared with. */
export function workshopRecord(repo: Repo, id: string): (WorkshopState & { members: Member[] }) | null {
  const state = repo.loadWorkshop(id)
  return state && { ...state, members: repo.listMembers(id) }
}

/** The pictures a workshop's slides and generated slides show, each with its original or cut-out. */
export function workshopAssets(repo: Repo, state: WorkshopState): Asset[] {
  const hashes = new Set([...JSON.stringify(state.items).matchAll(/asset:([0-9a-f]{64})/g)].map((m) => m[1]))
  for (const h of Object.values(state.workshop.pictures)) hashes.add(h)
  for (const h of [...hashes]) {
    const pair = repo.assetPair(h)
    if (pair) for (const x of [pair.original, pair.cutout]) if (x) hashes.add(x)
  }
  return [...hashes].sort().flatMap((h) => repo.getAsset(h) ?? [])
}

/** The file name of a workshop's archive. */
export const workshopZipName = (state: WorkshopState) => `${safePart(state.workshop.title, 'Workshop')}.zip`

/**
 * One workshop: `workshop.json` (format, export time, the record; each attachment with the path of its file, or null
 * when it was missing), `files/` under the attachments' names, `pictures/` under their hashes.
 */
export function workshopZip(repo: Repo, filesDir: string, id: string, options?: { zip64Over?: number }): ReadableStream<Uint8Array> | null {
  const record = workshopRecord(repo, id)
  if (!record) return null
  const assets = workshopAssets(repo, record)
  const { file, asset } = filePaths(filesDir)
  async function* parts(): AsyncGenerator<ZipPart> {
    const taken = new Set<string>()
    const attachments: (Attachment & { file: string | null })[] = []
    for (const a of record!.attachments) {
      const data = await read(file(a.id))
      const at = data ? unique(taken, `files/${safePart(a.name, a.id)}`) : null
      attachments.push({ ...a, file: at })
      if (data && at) yield { path: at, data: bytes(data) }
    }
    const pictures: (Asset & { file: string | null })[] = []
    for (const p of assets) {
      const data = await read(asset(p.hash))
      const at = data ? `pictures/${p.hash}.${extension(p.mime)}` : null
      pictures.push({ ...p, file: at })
      if (data && at) yield { path: at, data: bytes(data) }
    }
    yield json('workshop.json', { format: 'session-planner/workshop', version: EXPORT_VERSION, exportedAt: new Date().toISOString(), ...record, attachments, pictures })
  }
  return zipStream(parts(), options)
}

/**
 * All data without the media: `manifest.json`, `settings.json`, one file per workshop in `workshops/`, `library.json`,
 * `decks.json` (with their slides), `themes.json` (data themes with their pools), `slide-templates.json` and
 * `assets.json` (the pictures' records; the pictures themselves are in the media export).
 */
export function dataZip(repo: Repo, options?: { zip64Over?: number }): ReadableStream<Uint8Array> {
  const exportedAt = new Date().toISOString()
  const summaries = repo.listWorkshops()
  const library = repo.listLibrary()
  const decks = repo.listDecks().flatMap((d) => repo.getDeck(d.id) ?? [])
  const themes = repo.listThemes().map((t) => ({ ...t, pool: repo.listPool(t.id) }))
  const templates = repo.listSlideTemplates()
  const assets = repo.listAssets()
  async function* parts(): AsyncGenerator<ZipPart> {
    const taken = new Set<string>()
    const workshops: { id: string; title: string; file: string }[] = []
    for (const s of summaries) {
      const record = workshopRecord(repo, s.id)
      if (!record) continue // deleted since the list was read
      const at = unique(taken, `workshops/${safePart(record.workshop.title, 'Workshop')} – ${s.id.slice(0, 8)}.json`)
      workshops.push({ id: s.id, title: record.workshop.title, file: at })
      yield json(at, record)
    }
    yield json('settings.json', repo.getSettings())
    yield json('library.json', library)
    yield json('decks.json', decks)
    yield json('themes.json', themes)
    yield json('slide-templates.json', templates)
    yield json('assets.json', assets)
    yield json('manifest.json', {
      format: 'session-planner/data',
      version: EXPORT_VERSION,
      exportedAt,
      workshops,
      counts: { workshops: workshops.length, library: library.length, decks: decks.length, themes: themes.length, slideTemplates: templates.length, assets: assets.length },
      media: 'The files, pictures, theme files and logos are in the media export; its media.json ties each to the ids here.',
    })
  }
  return zipStream(parts(), options)
}

/** One file of the media export, as media.json lists it. */
interface MediaEntry {
  file: string
  kind: 'attachment' | 'library-attachment' | 'picture' | 'theme-file' | 'theme-logo' | 'logo' | 'folder-theme'
  id?: string
  workshopId?: string
  entryId?: string
  themeId?: string
  name?: string
  mime?: string
  size: number
}

/**
 * All media: `attachments/<workshop>/`, `library/<entry>/`, `pictures/<hash>.<ext>`, `theme-files/<theme>/`,
 * `theme-logos/`, `logo.<ext>` (the printouts' logo), `themes/<folder>/` (folder themes) and `media.json`, which names
 * each file's kind and the ids it belongs to, and the files that were missing on disk.
 */
export function mediaZip(repo: Repo, filesDir: string, themesDir: string | undefined, options?: { zip64Over?: number }): ReadableStream<Uint8Array> {
  const { file, asset, themeFile, themeLogo, logo } = filePaths(filesDir)
  const summaries = repo.listWorkshops()
  const library = repo.listLibrary()
  const assets = repo.listAssets()
  const themes = repo.listThemes()
  const settings = repo.getSettings()
  async function* parts(): AsyncGenerator<ZipPart> {
    const taken = new Set<string>()
    const index: MediaEntry[] = []
    const missing: Omit<MediaEntry, 'file' | 'size'>[] = []
    async function* add(source: string, wanted: string, entry: Omit<MediaEntry, 'file' | 'size'>): AsyncGenerator<ZipPart> {
      const data = await read(source)
      if (!data) {
        missing.push(entry)
        return
      }
      const at = unique(taken, wanted)
      index.push({ file: at, ...entry, size: data.length })
      yield { path: at, data: bytes(data) }
    }
    const folders = new Set<string>()
    const folderOf = (prefix: string, name: string, id: string) => {
      const wanted = `${prefix}/${safePart(name, id.slice(0, 8))}`
      let candidate = wanted
      for (let n = 2; folders.has(candidate.toLowerCase()); n++) candidate = `${wanted} (${n})`
      folders.add(candidate.toLowerCase())
      return candidate
    }
    for (const s of summaries) {
      const state = repo.loadWorkshop(s.id)
      if (!state?.attachments.length) continue
      const dir = folderOf('attachments', state.workshop.title, s.id)
      for (const a of state.attachments) yield* add(file(a.id), `${dir}/${safePart(a.name, a.id)}`, { kind: 'attachment', id: a.id, workshopId: s.id, name: a.name, mime: a.mime })
    }
    for (const e of library) {
      if (!e.attachments.length) continue
      const dir = folderOf('library', e.title, e.id)
      for (const a of e.attachments) yield* add(file(a.id), `${dir}/${safePart(a.name, a.id)}`, { kind: 'library-attachment', id: a.id, entryId: e.id, name: a.name, mime: a.mime })
    }
    for (const p of assets) yield* add(asset(p.hash), `pictures/${p.hash}.${extension(p.mime)}`, { kind: 'picture', id: p.hash, mime: p.mime })
    for (const t of themes) {
      for (const f of t.files) yield* add(themeFile(t.id, f.path), `theme-files/${t.id}/${f.path}`, { kind: 'theme-file', themeId: t.id, name: f.path, mime: f.mime })
      for (const variant of ['logo', 'logoLight'] as const) {
        const l = t[variant]
        if (l) yield* add(themeLogo(t.id, variant), `theme-logos/${t.id}${variant === 'logo' ? '' : '-light'}.${extension(l.mime)}`, { kind: 'theme-logo', themeId: t.id, name: variant, mime: l.mime })
      }
    }
    if (settings.logo) yield* add(logo, `logo.${extension(settings.logo.mime)}`, { kind: 'logo', mime: settings.logo.mime })
    if (themesDir) {
      for (const name of folderThemes(themesDir)) {
        const root = themeFolderFile(themesDir, name)
        const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => [])
        // Only plain files: a link could lead out of the folder.
        for (const d of entries.filter((d) => d.isFile()).sort((a, b) => path.join(a.parentPath, a.name).localeCompare(path.join(b.parentPath, b.name)))) {
          const rel = path.relative(root, path.join(d.parentPath, d.name)).split(path.sep).join('/')
          yield* add(themeFolderFile(themesDir, name, ...rel.split('/')), `themes/${name}/${rel}`, { kind: 'folder-theme', themeId: name, name: rel })
        }
      }
    }
    yield json('media.json', { format: 'session-planner/media', version: EXPORT_VERSION, exportedAt: new Date().toISOString(), files: index, missing })
  }
  return zipStream(parts(), options)
}
