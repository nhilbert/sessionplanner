import type { Attachment, LibraryEntry, Settings, WorkshopState, WorkshopSummary } from './domain/types'
import type { Op } from './domain/ops'

/** Thin client for the server API (server/app.ts). Changes carry the app's header (server/guard.ts). */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('x-sp', '1')
  if (init.body && typeof init.body === 'string') headers.set('content-type', 'application/json')
  const res = await fetch(path, { ...init, headers })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return (await res.json()) as T
}

export const api = {
  listWorkshops: () => call<WorkshopSummary[]>('/api/workshops'),
  createWorkshop: (input: { title?: string; client?: string; date?: string }) => call<WorkshopState>('/api/workshops', { method: 'POST', body: JSON.stringify(input) }),
  loadWorkshop: (id: string) => call<WorkshopState>(`/api/workshops/${id}`),
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
  listLibrary: () => call<LibraryEntry[]>('/api/library'),
  saveLibraryEntry: (entry: Pick<LibraryEntry, 'kind' | 'title' | 'data'>, id?: string) =>
    call<LibraryEntry>(id ? `/api/library/${id}` : '/api/library', { method: id ? 'PUT' : 'POST', body: JSON.stringify(entry) }),
  deleteLibraryEntry: (id: string) => call<{ ok: true }>(`/api/library/${id}`, { method: 'DELETE' }),
  eventsUrl: (id: string) => `/api/workshops/${id}/events`,
  downloadUrl: (attachmentId: string) => `/api/attachments/${attachmentId}`,
}
