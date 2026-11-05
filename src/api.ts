import type { Asset, Attachment, Deck, DeckSlide, LibraryEntry, Me, Member, MemberRole, Settings, SlideTemplate, WorkshopState, WorkshopSummary } from './domain/types'
import type { Op, PresentPosition } from './domain/ops'
import { apiUrl, themeUrl } from './domain/addresses'
import { type PoolAsset, type PoolKind, type Theme, type ThemeInfo, themeLogoUrl, type ThemeTokens } from './domain/theme'
import i18n from './i18n'

/** Thin client for the server API (server/app.ts). Changes carry the app's header (server/guard.ts). Paths here start after the API's own address (domain/addresses.ts). */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const LOGIN_REQUIRED = 'sp:login-required'

const fileForm = (file: File): FormData => {
  const form = new FormData()
  form.append('file', file)
  return form
}

/** Tells the user that an action failed, with the server's reason, where the action has no place of its own to show it. */
export function reportFailure(err: unknown): void {
  // An expired login has its own banner (components/AppShell.tsx).
  if (err instanceof ApiError && err.status === 401) return
  const reason = err instanceof Error ? err.message : String(err)
  window.alert(i18n.t('common.failed', { error: reason }))
}

/** Where a slide's pictures come from: a workshop's own route (its guests may load them) or the owner's library. */
export type AssetScope = { workshopId: string } | 'library'
/** The ground a picture is shown on: under a dark theme the server answers with a cut-out's dark variant (docs/slides.md, section 5). */
export type AssetGround = 'light' | 'dark'
const assetPath = (scope: AssetScope, hash: string): string => (scope === 'library' ? `/library/assets/${hash}` : `/workshops/${scope.workshopId}/assets/${hash}`)
export const assetUrl = (scope: AssetScope, hash: string, ground: AssetGround = 'light'): string =>
  apiUrl(`${assetPath(scope, hash)}${ground === 'dark' ? '?ground=dark' : ''}`)
/** An asset with its original and its cut-out (docs/slides.md): the two a picture field may switch between. */
export interface AssetInfo {
  hash: string
  original: string
  cutout: string | null
}

export interface AgentConnections {
  connections: AgentConnection[]
  /** The address to enter in Claude (…/mcp). */
  resource: string
  /** Hosted: a new connection must be started here first; locally not. */
  armRequired: boolean
  /** Until when a new connection may be approved, or null. */
  armedUntil: string | null
}

export interface AgentConnection {
  id: string
  name: string
  user: string
  createdAt: string
  lastUsedAt: string | null
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('x-sp', '1')
  if (init.body && typeof init.body === 'string') headers.set('content-type', 'application/json')
  const res = await fetch(apiUrl(path), { ...init, headers })
  // The login in front has expired (or is new): say so app-wide instead of failing quietly (components/AppShell.tsx).
  if (res.status === 401) window.dispatchEvent(new Event(LOGIN_REQUIRED))
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return (await res.json()) as T
}

export const api = {
  me: () => call<Me>('/me'),
  people: () => call<{ email: string; allowed: boolean | null; workshops: number }[]>('/people'),
  listMembers: (id: string) => call<Member[]>(`/workshops/${id}/members`),
  setMember: (id: string, email: string, role: MemberRole, showNotes: boolean) =>
    call<Member>(`/workshops/${id}/members/${encodeURIComponent(email)}`, { method: 'PUT', body: JSON.stringify({ role, showNotes }) }),
  removeMember: (id: string, email: string) => call<{ ok: true }>(`/workshops/${id}/members/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  listWorkshops: () => call<WorkshopSummary[]>('/workshops'),
  createWorkshop: (input: { title?: string; client?: string; date?: string }) => call<WorkshopState>('/workshops', { method: 'POST', body: JSON.stringify(input) }),
  loadWorkshop: (id: string) => call<WorkshopState>(`/workshops/${id}`),
  duplicateWorkshop: (id: string, input: { title: string; firstDate?: string }) => call<WorkshopState>(`/workshops/${id}/duplicate`, { method: 'POST', body: JSON.stringify(input) }),
  deleteWorkshop: (id: string) => call<{ ok: true }>(`/workshops/${id}`, { method: 'DELETE' }),
  sendOps: (id: string, clientId: string, ops: Op[]) => call<{ ok: true; ops: Op[] }>(`/workshops/${id}/ops`, { method: 'POST', body: JSON.stringify({ clientId, ops }) }),
  upload: (id: string, file: File) => call<Attachment>(`/workshops/${id}/attachments`, { method: 'POST', body: fileForm(file) }),
  deleteAttachment: (id: string) => call<{ ok: true }>(`/attachments/${id}`, { method: 'DELETE' }),
  renameAttachment: (id: string, name: string) => call<Attachment>(`/attachments/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  replaceAttachment: (id: string, file: File) => call<Attachment>(`/attachments/${id}/file`, { method: 'PUT', body: fileForm(file) }),
  getSettings: () => call<Settings>('/settings'),
  saveSettings: (settings: Omit<Settings, 'logo'>) => call<Settings>('/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  uploadLogo: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return call<Settings>('/settings/logo', { method: 'POST', body: form })
  },
  deleteLogo: () => call<Settings>('/settings/logo', { method: 'DELETE' }),
  logoUrl: (settings: Settings) => (settings.logo ? apiUrl(`/settings/logo?v=${encodeURIComponent(settings.logo.updatedAt)}`) : null),
  /** AI agents connected over OAuth to /mcp (docs/mcp.md); 404 when OAuth is off on the server. */
  agentConnections: () => call<AgentConnections>('/mcp/connections'),
  /** Hosted: lets the owner approve one new connection in the next minutes (server/oauth.ts, arm). */
  armAgent: () => call<{ armedUntil: string; resource: string }>('/mcp/arm', { method: 'POST' }),
  disconnectAgent: (id: string) => call<{ ok: boolean }>(`/mcp/connections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listLibrary: () => call<LibraryEntry[]>('/library'),
  saveLibraryEntry: (entry: Pick<LibraryEntry, 'kind' | 'title' | 'data'>, id?: string) =>
    call<LibraryEntry>(id ? `/library/${id}` : '/library', { method: id ? 'PUT' : 'POST', body: JSON.stringify(entry) }),
  deleteLibraryEntry: (id: string) => call<{ ok: true }>(`/library/${id}`, { method: 'DELETE' }),
  /** The answers are the entry as it now is. `item`: which item of a group entry holds the file. */
  uploadLibraryFile: (entryId: string, item: number, file: File) => {
    const form = fileForm(file)
    form.append('item', String(item))
    return call<LibraryEntry>(`/library/${entryId}/attachments`, { method: 'POST', body: form })
  },
  renameLibraryFile: (id: string, name: string) => call<LibraryEntry>(`/library/attachments/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  replaceLibraryFile: (id: string, file: File) => call<LibraryEntry>(`/library/attachments/${id}/file`, { method: 'PUT', body: fileForm(file) }),
  deleteLibraryFile: (id: string) => call<LibraryEntry>(`/library/attachments/${id}`, { method: 'DELETE' }),
  /** Copies an entry's files into a workshop: library attachment id → the workshop's copy. */
  copyLibraryFiles: (entryId: string, workshopId: string) => call<Record<string, Attachment>>(`/library/${entryId}/copies/${workshopId}`, { method: 'POST' }),
  eventsUrl: (id: string) => apiUrl(`/workshops/${id}/events`),
  /** Pages the presentation of a workshop: every window that presents or leads it follows (docs/slides.md, Presenting). */
  present: (id: string, position: PresentPosition) => call<{ ok: true }>(`/workshops/${id}/present`, { method: 'POST', body: JSON.stringify(position) }),
  /** A picture for slides, stored once by its content (docs/slides.md). */
  uploadAsset: (scope: AssetScope, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return call<Asset & { cutout: string | null }>(scope === 'library' ? '/library/assets' : `/workshops/${scope.workshopId}/assets`, { method: 'POST', body: form })
  },
  assetInfo: (scope: AssetScope, hash: string) => call<AssetInfo>(`${assetPath(scope, hash)}/info`),
  sweepAssets: () => call<{ removed: number }>('/assets/sweep', { method: 'POST' }),
  /** Every slide theme the server has: built in, folders and data themes (docs/slides.md, section 4). */
  listThemes: () => call<ThemeInfo[]>('/themes'),
  themeCssUrl: (id: string, version?: string) => themeUrl(id, `theme.css${version ? `?v=${encodeURIComponent(version)}` : ''}`),
  getTheme: (id: string) => call<Theme>(`/themes/${encodeURIComponent(id)}`),
  createTheme: (input: { name: string; id?: string; tokens?: ThemeTokens; css?: string; from?: string }) => call<Theme>('/themes', { method: 'POST', body: JSON.stringify(input) }),
  updateTheme: (id: string, patch: { name?: string; tokens?: ThemeTokens; css?: string }) => call<Theme>(`/themes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteTheme: (id: string) => call<{ ok: true }>(`/themes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  uploadThemeLogo: (id: string, file: File, variant: 'logo' | 'logoLight') => {
    const form = new FormData()
    form.append('file', file)
    return call<Theme>(`/themes/${encodeURIComponent(id)}/logo${variant === 'logoLight' ? '?variant=light' : ''}`, { method: 'POST', body: form })
  },
  deleteThemeLogo: (id: string, variant: 'logo' | 'logoLight') => call<Theme>(`/themes/${encodeURIComponent(id)}/logo${variant === 'logoLight' ? '?variant=light' : ''}`, { method: 'DELETE' }),
  themeLogoUrl: (theme: Theme, variant: 'logo' | 'logoLight') => themeLogoUrl(theme, variant),
  /** A file of a theme (a font, a picture its own rules use), at the path the rules address it by. */
  uploadThemeFile: (id: string, file: File, path: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('path', path)
    return call<Theme>(`/themes/${encodeURIComponent(id)}/files`, { method: 'POST', body: form })
  },
  deleteThemeFile: (id: string, path: string) => call<Theme>(`/themes/${encodeURIComponent(id)}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  /** The asset pool of a theme: pictures for the generated slides, icons for cards (docs/slides.md, section 4). */
  getPool: (id: string) => call<PoolAsset[]>(`/themes/${encodeURIComponent(id)}/pool`),
  uploadPoolAsset: (id: string, file: File, kind: PoolKind, tags = '') => {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', kind)
    form.append('tags', tags)
    return call<PoolAsset>(`/themes/${encodeURIComponent(id)}/pool`, { method: 'POST', body: form })
  },
  addPoolAsset: (id: string, entry: { hash: string; kind: PoolKind; tags?: string[] }) => call<PoolAsset>(`/themes/${encodeURIComponent(id)}/pool`, { method: 'POST', body: JSON.stringify(entry) }),
  updatePoolAsset: (id: string, hash: string, patch: { tags?: string[]; position?: number; kind?: PoolKind }) => call<PoolAsset>(`/themes/${encodeURIComponent(id)}/pool/${hash}`, { method: 'PUT', body: JSON.stringify(patch) }),
  removePoolAsset: (id: string, hash: string) => call<{ ok: true }>(`/themes/${encodeURIComponent(id)}/pool/${hash}`, { method: 'DELETE' }),
  /** Template slides (docs/slides.md, section 7), the owner's. */
  listSlideTemplates: () => call<SlideTemplate[]>('/slide-templates'),
  saveSlideTemplate: (input: { name: string; html: string; position?: number }, id?: string) => call<SlideTemplate>(id ? `/slide-templates/${id}` : '/slide-templates', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) }),
  deleteSlideTemplate: (id: string) => call<{ ok: true }>(`/slide-templates/${id}`, { method: 'DELETE' }),
  listDecks: () => call<Deck[]>('/decks'),
  getDeck: (id: string) => call<{ deck: Deck; slides: DeckSlide[] }>(`/decks/${id}`),
  createDeck: (input: { title: string; theme: string; source: string; slides: { html: string; caption: string }[] }) => call<{ deck: Deck; slides: DeckSlide[] }>('/decks', { method: 'POST', body: JSON.stringify(input) }),
  updateDeck: (id: string, patch: { title?: string; theme?: string }) => call<Deck>(`/decks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteDeck: (id: string) => call<{ ok: true }>(`/decks/${id}`, { method: 'DELETE' }),
  downloadUrl: (attachmentId: string) => apiUrl(`/attachments/${attachmentId}`),
  libraryFileUrl: (attachmentId: string) => apiUrl(`/library/attachments/${attachmentId}`),
}
