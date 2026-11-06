import { describe, expect, it } from 'vitest'
import { inOrder } from './inOrder'

describe('saves in order', () => {
  it('runs saves of one record one after the other and knows the latest', async () => {
    const log: string[] = []
    const slow = (name: string, ms: number) => () => new Promise<string>((r) => setTimeout(() => (log.push(name), r(name)), ms))
    const a = inOrder('x', slow('a', 30))
    const b = inOrder('x', slow('b', 1))
    const other = inOrder('y', slow('y', 1))
    await Promise.all([a.result, b.result, other.result])
    // b waited for a although it was faster; y did not wait.
    expect(log).toEqual(['y', 'a', 'b'])
    expect(a.isLatest()).toBe(false)
    expect(b.isLatest()).toBe(true)
  })
  it('goes on after a failed save', async () => {
    const failed = inOrder('z', () => Promise.reject(new Error('offline')))
    const next = inOrder('z', () => Promise.resolve('ok'))
    await expect(failed.result).rejects.toThrow('offline')
    await expect(next.result).resolves.toBe('ok')
  })
})
