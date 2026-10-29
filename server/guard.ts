import type { Context, Next } from 'hono'

export interface GuardOptions {
  /** Public address when hosted behind the login proxy (SP_PUBLIC_URL); its host and origin pass next to loopback. */
  publicUrl?: URL
  /** Hosted: e-mail addresses allowed in, as set by the login proxy in `ownerHeader`. Empty = no check (local use). */
  owners: string[]
  ownerHeader: string
}

/**
 * Only the app itself may talk to the API: requests must reach a loopback host or the public address, and
 * a browser's Origin must be one of those. Changes (anything but GET/HEAD) must also carry the app's own
 * header, which a cross-site page cannot add without a CORS preflight this server never grants. GET stays
 * possible without it, so downloads and the live-update stream work as plain links and EventSource.
 */
export function isTrusted(headers: Headers, url: string, method: string, publicUrl?: URL): boolean {
  const hostHeader = headers.get('host') ?? new URL(url).host
  const host = hostHeader.replace(/:\d+$/, '')
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== publicUrl?.hostname) return false
  const origin = headers.get('origin')
  if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin) && origin !== publicUrl?.origin) return false
  return method === 'GET' || method === 'HEAD' || headers.get('x-sp') === '1'
}

/**
 * Hosted, the owner API also needs the e-mail header that only the login proxy sets (Caddy strips it from
 * incoming requests), so a routing mistake in front of the app fails closed.
 */
export function isOwner(headers: Headers, owners: string[], ownerHeader: string): boolean {
  if (!owners.length) return true
  const email = headers.get(ownerHeader)?.trim().toLowerCase()
  return !!email && owners.includes(email)
}

export function guard({ publicUrl, owners, ownerHeader }: GuardOptions) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    if (!isTrusted(c.req.raw.headers, c.req.url, c.req.method, publicUrl)) return c.json({ error: 'forbidden' }, 403)
    if (!isOwner(c.req.raw.headers, owners, ownerHeader)) return c.json({ error: 'login_required' }, 401)
    await next()
  }
}
