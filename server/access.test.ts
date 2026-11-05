import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { decide, eventFor, type Rule, mayApply, requireRules, rulesFor, type WorkshopAccess } from './access.ts'
import type { Env, User } from './guard.ts'
import { openDb } from './db.ts'
import { Repo } from './repo.ts'
import type { Op, ServerEvent } from '../src/domain/ops.ts'

const owner: User = { email: 'owner@example.com', owner: true }
const guest: User = { email: 'guest@example.com', owner: false }
const view: WorkshopAccess = { role: 'view', showNotes: false }
const viewWithNotes: WorkshopAccess = { role: 'view', showNotes: true }
const edit: WorkshopAccess = { role: 'edit', showNotes: true }

describe('decide', () => {
  it.each<[Rule, User | undefined, WorkshopAccess | null, number | null]>([
    ['public', undefined, null, null],
    ['own-token', undefined, null, null],
    ['signed-in', undefined, null, 401],
    ['signed-in', guest, null, null],
    ['owner', undefined, null, 401],
    ['owner', guest, edit, 403],
    ['owner', owner, null, null],
    ['workshop-view', undefined, 'owner', 401],
    ['workshop-view', guest, null, 404],
    ['workshop-view', guest, view, null],
    ['workshop-view', owner, 'owner', null],
    ['workshop-edit', undefined, 'owner', 401],
    ['workshop-edit', guest, null, 404],
    ['workshop-edit', guest, view, 403],
    ['workshop-edit', guest, viewWithNotes, 403],
    ['workshop-edit', guest, edit, null],
    ['workshop-edit', owner, 'owner', null],
  ])('%s for %j with %j answers %s', (rule, user, access, answer) => {
    expect(decide(rule, user, access)).toBe(answer)
  })

  it('refuses a rule it does not know, for the owner too', () => {
    expect(decide('everybody' as Rule, owner, 'owner')).toBe(403)
  })
})

describe('requireRules', () => {
  const allow = rulesFor(new Repo(openDb(':memory:')))
  const handler = () => new Response('ok')
  const app = () => new Hono<Env>()

  it('stops an app with an /api/ route that has no rule, and names it', () => {
    const a = app()
    a.get('/api/ruled', allow('owner'), handler)
    a.post('/api/forgotten', handler)
    expect(() => requireRules(a)).toThrow('POST /api/forgotten')
  })

  it('passes a route with a rule of its own or on a group around it', () => {
    const a = app()
    a.get('/api/ruled', allow('signed-in'), handler)
    a.use('/api/group', allow('owner'))
    a.use('/api/group/*', allow('owner'))
    a.get('/api/group', handler)
    a.delete('/api/group/:id/deep', handler)
    expect(() => requireRules(a)).not.toThrow()
  })

  it('does not count a rule for another method, a neighbouring address or behind the route', () => {
    const method = app()
    method.get('/api/x', allow('owner'), handler)
    method.post('/api/x', handler)
    expect(() => requireRules(method)).toThrow('POST /api/x')

    const neighbour = app()
    neighbour.use('/api/group/*', allow('owner'))
    neighbour.get('/api/groupie', handler)
    expect(() => requireRules(neighbour)).toThrow('GET /api/groupie')

    const late = app()
    late.get('/api/x', handler)
    late.use('/api/*', handler)
    late.use('/api/x', allow('owner'))
    expect(() => requireRules(late)).toThrow('GET /api/x')
  })

  it('leaves what every request passes, and addresses outside /api, alone', () => {
    const a = app()
    a.use('*', async (_c, next) => next())
    a.use('/api/*', async (_c, next) => next())
    a.all('/api/*', handler)
    a.get('/page', handler)
    expect(() => requireRules(a)).not.toThrow()
  })

  it('does not take a group on any other address for the layer every request passes', () => {
    const a = app()
    a.all('/api/forgotten/*', handler)
    expect(() => requireRules(a)).toThrow('ALL /api/forgotten/*')
  })
})

describe('allow', () => {
  it('asks for the workshop the route says, and an unknown one answers 404, also for a rule on a file', async () => {
    const repo = new Repo(openDb(':memory:'))
    const allow = rulesFor(repo)
    const a = new Hono<Env>()
    a.use('*', async (c, next) => {
      c.set('user', guest)
      await next()
    })
    a.get('/api/files/:id', allow('workshop-view', () => null), () => new Response('ok'))
    expect((await a.request('/api/files/x')).status).toBe(404)
  })

  it('refuses a workshop rule before the login has said who it is', async () => {
    const a = new Hono<Env>()
    a.get('/api/workshops/:id', rulesFor(new Repo(openDb(':memory:')))('workshop-view'), () => new Response('ok'))
    expect((await a.request('/api/workshops/x')).status).toBe(401)
  })
})

describe('what guests get', () => {
  const set = (fields: Record<string, unknown>) => [{ op: 'set', entity: 'workshop', id: 'w', fields }] as unknown as Op[]

  it('keeps archiving and the theme with the owner', () => {
    expect(mayApply('owner', set({ archived: true }))).toBe(true)
    expect(mayApply(edit, set({ archived: true }))).toBe(false)
    expect(mayApply(edit, set({ theme: 'x' }))).toBe(false)
    expect(mayApply(edit, set({ title: 'x' }))).toBe(true)
  })

  const ops = { type: 'ops', clientId: 'c', ops: [] } as ServerEvent
  const present = { type: 'present', key: 'k', n: 1, tag: 't' } as ServerEvent
  const deleted = { type: 'workshop-deleted' } as ServerEvent

  it('tells a guest without the notes only that something changed', () => {
    expect(eventFor(view, ops)).toEqual({ type: 'changed' })
    expect(eventFor(view, deleted)).toEqual(deleted)
    expect(eventFor(viewWithNotes, ops)).toEqual(ops)
    expect(eventFor(edit, ops)).toEqual(ops)
    expect(eventFor('owner', ops)).toEqual(ops)
  })

  it('shows paging only to those who lead a presentation, and no change of members to anyone', () => {
    expect(eventFor(view, present)).toBeNull()
    expect(eventFor(viewWithNotes, present)).toBeNull()
    expect(eventFor(edit, present)).toEqual(present)
    expect(eventFor('owner', present)).toEqual(present)
    expect(eventFor('owner', { type: 'members-changed' })).toBeNull()
  })
})

describe('print views and exports', () => {
  const src = path.join(import.meta.dirname, '..', 'src')
  const read = (...p: string[]) => readFileSync(path.join(src, ...p), 'utf8')

  it('have no addresses of their own: the print views ask the server nothing', () => {
    for (const f of readdirSync(path.join(src, 'print')).filter((n) => /\.tsx?$/.test(n))) expect(read('print', f), f).not.toMatch(/\/api\/|fetch\(/)
    expect(read('slides', 'SlidesPrint.tsx')).not.toMatch(/\/api\/|fetch\(/)
  })

  it('the slide export reads only the theme and the pictures the rules hand out', () => {
    // '/api/' is the filter on addresses a theme's stylesheet names: its logos, under the same rules.
    expect([...read('slides', 'export.ts').matchAll(/[`'"](\/api\/[^`'"$]*)/g)].map((m) => m[1])).toEqual(['/api/themes/', '/api/'])
  })
})
