import type { Context, Next } from 'hono'
import { timingSafeEqual } from 'node:crypto'

export interface GuardOptions {
  /** Public address when hosted behind the login proxy (SP_PUBLIC_URL); its host and origin pass next to loopback. */
  publicUrl?: URL
  /** Hosted: the owner's e-mail address(es), as set by the login proxy in `ownerHeader`. Empty = everybody is the owner (local use). */
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

/** Who sent a request: the owner(s) see everything, a guest only the workshops shared with their e-mail. */
export interface User {
  email: string | null
  owner: boolean
}

export type Env = { Variables: { user: User } }

/**
 * Hosted, the login proxy sets the signed-in e-mail (Caddy strips it from incoming requests, and only Caddy can
 * reach this container), so the header tells who is there; without it nothing is answered. Without an owner
 * list (local use, no login in front) everybody is the owner.
 */
export function userOf(headers: Headers, owners: string[], ownerHeader: string): User | null {
  const email = headers.get(ownerHeader)?.trim().toLowerCase() || null
  if (!owners.length) return { email, owner: true }
  if (!email) return null
  return { email, owner: owners.includes(email) }
}

export function guard({ publicUrl, owners, ownerHeader }: GuardOptions) {
  return async (c: Context<Env>, next: Next): Promise<Response | void> => {
    if (!isTrusted(c.req.raw.headers, c.req.url, c.req.method, publicUrl)) return c.json({ error: 'forbidden' }, 403)
    const user = userOf(c.req.raw.headers, owners, ownerHeader)
    if (!user) return c.json({ error: 'login_required' }, 401)
    c.set('user', user)
    await next()
  }
}

/** Compares a presented bearer token with the configured one in constant time. */
export function sameToken(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** For routes only the owner may use. */
export async function ownerOnly(c: Context<Env>, next: Next): Promise<Response | void> {
  if (!c.get('user').owner) return c.json({ error: 'forbidden' }, 403)
  await next()
}
