import type { Asset, Attachment, Deck, DeckSlide, LibraryEntry, Me, Member, MemberRole, Settings, SlideTemplate, WorkshopState, WorkshopSummary } from './domain/types'
import type { Op } from './domain/ops'
import type { Theme, ThemeInfo, ThemeTokens } from './domain/theme'

/** Thin client for the server API (server/app.ts). Changes carry the app's header (server/guard.ts). */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export const LOGIN_REQUIRED = 'sp:login-required'

/** Where a slide's pictures come from: a workshop's own route (its guests may load them) or the owner's library. */
export type AssetScope = { workshopId: string } | 'library'
export const assetUrl = (scope: AssetScope, hash: string): string => (scope === 'library' ? `/api/library/assets/${hash}` : `/api/workshops/${scope.workshopId}/assets/${hash}`)

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
  const res = await fetch(path, { ...init, headers })
  // The login in front has expired (or is new): say so app-wide instead of failing quietly (components/AppShell.tsx).
  if (res.status === 401) window.dispatchEvent(new Event(LOGIN_REQUIRED))
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return (await res.json()) as T
}

export const api = {
  me: () => call<Me>('/api/me'),
  people: () => call<{ email: string; allowed: boolean | null; workshops: number }[]>('/api/people'),
  listMembers: (id: string) => call<Member[]>(`/api/workshops/${id}/members`),
  setMember: (id: string, email: string, role: MemberRole, showNotes: boolean) =>
    call<Member>(`/api/workshops/${id}/members/${encodeURIComponent(email)}`, { method: 'PUT', body: JSON.stringify({ role, showNotes }) }),
  removeMember: (id: string, email: string) => call<{ ok: true }>(`/api/workshops/${id}/members/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  listWorkshops: () => call<WorkshopSummary[]>('/api/workshops'),
  createWorkshop: (input: { title?: string; client?: string; date?: string }) => call<WorkshopState>('/api/workshops', { method: 'POST', body: JSON.stringify(input) }),
  loadWorkshop: (id: string) => call<WorkshopState>(`/api/workshops/${id}`),
  duplicateWorkshop: (id: string, input: { title: string; firstDate?: string }) => call<WorkshopState>(`/api/workshops/${id}/duplicate`, { method: 'POST', body: JSON.stringify(input) }),
  deleteWorkshop: (id: string) => call<{ ok: true }>(`/api/workshops/${id}`, { method: 'DELETE' }),
  sendOps: (id: string, clientId: string, ops: Op[]) => call<{ ok: true; ops: Op[] }>(`/api/workshops/${id}/ops`, { method: 'POST', body: JSON.stringify({ clientId, ops }) }),
  upload: (id: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return call<Attachment>(`/api/workshops/${id}/attachments`, { method: 'POST', body: form })
  },
  deleteAttachment: (id: string) => call<{ ok: true }>(`/api/attachments/${id}`, { method: 'DELETE' }),
  getSettings: () => call<Settings>('/api/settings'),
  saveSettings: (settings: Omit<Settings, 'logo'>) => call<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  uploadLogo: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return call<Settings>('/api/settings/logo', { method: 'POST', body: form })
  },
  deleteLogo: () => call<Settings>('/api/settings/logo', { method: 'DELETE' }),
  logoUrl: (settings: Settings) => (settings.logo ? `/api/settings/logo?v=${encodeURIComponent(settings.logo.updatedAt)}` : null),
  /** AI agents connected over OAuth to /mcp (docs/mcp.md); 404 when OAuth is off on the server. */
  agentConnections: () => call<{ connections: AgentConnection[] }>('/api/mcp/connections'),
  disconnectAgent: (id: string) => call<{ ok: boolean }>(`/api/mcp/connections/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  listLibrary: () => call<LibraryEntry[]>('/api/library'),
  saveLibraryEntry: (entry: Pick<LibraryEntry, 'kind' | 'title' | 'data'>, id?: string) =>
    call<LibraryEntry>(id ? `/api/library/${id}` : '/api/library', { method: id ? 'PUT' : 'POST', body: JSON.stringify(entry) }),
  deleteLibraryEntry: (id: string) => call<{ ok: true }>(`/api/library/${id}`, { method: 'DELETE' }),
  eventsUrl: (id: string) => `/api/workshops/${id}/events`,
  /** A picture for slides, stored once by its content (docs/slides.md). */
  uploadAsset: (scope: AssetScope, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return call<Asset>(scope === 'library' ? '/api/library/assets' : `/api/workshops/${scope.workshopId}/assets`, { method: 'POST', body: form })
  },
  sweepAssets: () => call<{ removed: number }>('/api/assets/sweep', { method: 'POST' }),
  /** Every slide theme the server has: built in, folders and data themes (docs/slides.md, section 4). */
  listThemes: () => call<ThemeInfo[]>('/api/themes'),
  themeCssUrl: (id: string, version?: string) => `/api/themes/${encodeURIComponent(id)}/theme.css${version ? `?v=${encodeURIComponent(version)}` : ''}`,
  getTheme: (id: string) => call<Theme>(`/api/themes/${encodeURIComponent(id)}`),
  createTheme: (input: { name: string; tokens?: ThemeTokens; from?: string }) => call<Theme>('/api/themes', { method: 'POST', body: JSON.stringify(input) }),
  updateTheme: (id: string, patch: { name?: string; tokens?: ThemeTokens }) => call<Theme>(`/api/themes/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(patch) }),
  deleteTheme: (id: string) => call<{ ok: true }>(`/api/themes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  uploadThemeLogo: (id: string, file: File, variant: 'logo' | 'logoLight') => {
    const form = new FormData()
    form.append('file', file)
    return call<Theme>(`/api/themes/${encodeURIComponent(id)}/logo${variant === 'logoLight' ? '?variant=light' : ''}`, { method: 'POST', body: form })
  },
  deleteThemeLogo: (id: string, variant: 'logo' | 'logoLight') => call<Theme>(`/api/themes/${encodeURIComponent(id)}/logo${variant === 'logoLight' ? '?variant=light' : ''}`, { method: 'DELETE' }),
  themeLogoUrl: (theme: Theme, variant: 'logo' | 'logoLight') => {
    const logo = variant === 'logo' ? theme.logo : theme.logoLight
    return logo ? `/api/themes/${encodeURIComponent(theme.id)}/${variant === 'logo' ? 'logo' : 'logo-light'}?v=${encodeURIComponent(logo.updatedAt)}` : null
  },
  /** Template slides (docs/slides.md, section 7), the owner's. */
  listSlideTemplates: () => call<SlideTemplate[]>('/api/slide-templates'),
  saveSlideTemplate: (input: { name: string; html: string; position?: number }, id?: string) => call<SlideTemplate>(id ? `/api/slide-templates/${id}` : '/api/slide-templates', { method: id ? 'PUT' : 'POST', body: JSON.stringify(input) }),
  deleteSlideTemplate: (id: string) => call<{ ok: true }>(`/api/slide-templates/${id}`, { method: 'DELETE' }),
  listDecks: () => call<Deck[]>('/api/decks'),
  getDeck: (id: string) => call<{ deck: Deck; slides: DeckSlide[] }>(`/api/decks/${id}`),
  createDeck: (input: { title: string; theme: string; source: string; slides: { html: string; caption: string }[] }) => call<{ deck: Deck; slides: DeckSlide[] }>('/api/decks', { method: 'POST', body: JSON.stringify(input) }),
  updateDeck: (id: string, patch: { title?: string; theme?: string }) => call<Deck>(`/api/decks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteDeck: (id: string) => call<{ ok: true }>(`/api/decks/${id}`, { method: 'DELETE' }),
  downloadUrl: (attachmentId: string) => `/api/attachments/${attachmentId}`,
}
