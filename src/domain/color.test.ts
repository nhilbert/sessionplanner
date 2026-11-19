import { describe, expect, it } from 'vitest'
import { groupRail } from './color.ts'

describe("a group's rail", () => {
  it("shows its members' colours, each as long as the member lasts", () => {
    expect(groupRail([
      { color: 'var(--c-slate)', minutes: 15 },
      { color: 'var(--line-2)', minutes: 15 },
      { color: 'var(--c-sage)', minutes: 30 },
    ])).toBe('linear-gradient(var(--c-slate) 0.0% 25.0%, var(--line-2) 25.0% 50.0%, var(--c-sage) 50.0% 100.0%)')
  })

  it('leaves out a member without a length (a marker, a note)', () => {
    expect(groupRail([
      { color: 'var(--ink-3)', minutes: 0 },
      { color: 'var(--c-clay)', minutes: 20 },
    ])).toBe('linear-gradient(var(--c-clay) 0.0% 100.0%)')
  })

  it('is nothing where no member has a length', () => {
    expect(groupRail([{ color: 'var(--ink-3)', minutes: 0 }])).toBeNull()
    expect(groupRail([])).toBeNull()
  })
})
