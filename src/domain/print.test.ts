import { describe, expect, it } from 'vitest'
import { dayRows, PRINT_DEFAULTS, type PrintLabels, printOptions, workshopMarkdown } from './print.ts'
import type { Item, WorkshopState } from './types.ts'

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  workshopId: 'w',
  dayId: 'd1',
  position: 1,
  groupId: null,
  kind: 'block',
  title: id,
  description: '',
  duration: 30,
  fixedStart: null,
  goal: '',
  method: '',
  lead: '',
  notes: '',
  materials: [],
  attachmentIds: [],
  categoryId: null,
  color: null,
  ...over,
})

// A fictional one-day workshop: a group of two steps, a cue, a fixed lunch after a gap, a marker.
const state: WorkshopState = {
  workshop: {
    id: 'w',
    title: 'Team day | Example Ltd',
    client: 'Example Ltd',
    location: 'Room 2',
    goal: 'Agree on three things.',
    notes: '# Before\n- Projector',
    timezone: 'Europe/Berlin',
    packing: { 'flip chart': { checked: true } },
    materials: [{ id: 'm0', label: 'Kit', qty: 1 }],
    archived: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  days: [{ id: 'd1', workshopId: 'w', position: 1, date: '2026-11-10', startMin: 540, endMin: 720 }],
  groups: [{ id: 'g1', workshopId: 'w', dayId: 'd1', position: 2, title: 'Arrival' }],
  items: [
    item('arrive', { kind: 'marker', title: 'Doors open', position: 1 }),
    item('welcome', { groupId: 'g1', title: 'Welcome', duration: 20, goal: 'Everyone knows the plan', method: 'Input', lead: 'NH', notes: '## Steps\n1. Say hello\n2. Show the | agenda', materials: [{ id: 'm1', label: 'Flip chart', qty: 2 }], attachmentIds: ['a1'], categoryId: 'input', position: 1 }),
    item('checkin', { groupId: 'g1', title: 'Check-in', duration: 25, description: 'One sentence each', position: 2 }),
    item('cue', { kind: 'note', title: 'Photo', description: 'Shoot the charts', position: 3 }),
    item('lunch', { kind: 'break', title: 'Lunch', duration: 60, fixedStart: 600, position: 4 }),
  ],
  attachments: [{ id: 'a1', workshopId: 'w', name: 'slides.pdf', mime: 'application/pdf', size: 1, createdAt: '' }],
}

const labels: PrintLabels = {
  variant: 'Plan',
  untitled: 'Untitled',
  day: (n) => `Day ${n}`,
  time: 'Time',
  duration: 'Duration',
  content: 'Content',
  goal: 'Goal',
  method: 'Method',
  lead: 'Lead',
  category: 'Category',
  material: 'Material',
  files: 'Files',
  notes: 'Notes',
  packing: 'Packing list',
  venue: 'at the venue',
  dayOverview: 'At a glance',
  gap: (d) => `${d} free`,
  overlap: (d) => `${d} overlap`,
  late: (t) => `does not fit before ${t}`,
  categoryOf: (i) => (i.categoryId === 'input' ? 'Input' : null),
}
const date = (d: string, long?: boolean) => (long ? `Tuesday ${d}` : d)

describe('dayRows', () => {
  it('numbers the blocks, keeps groups as headings and hides what the view hides', () => {
    const { rows } = dayRows(state, state.days[0], 'plan', PRINT_DEFAULTS.plan)
    expect(rows.map((r) => (r.kind === 'group' ? `G:${r.title}` : `${r.item.id}:${r.number ?? '-'}`))).toEqual(['arrive:-', 'G:Arrival', 'welcome:1', 'checkin:2', 'cue:-', 'lunch:-'])
    const group = rows[1]
    expect(group.kind === 'group' && [group.start, group.end]).toEqual([540, 585])
    const lunch = rows[5]
    expect(lunch.kind === 'item' && lunch.gap).toBe(15)
  })
  it('leaves cues out of the client agenda, and breaks and markers when switched off', () => {
    const agenda = dayRows(state, state.days[0], 'agenda', PRINT_DEFAULTS.agenda).rows
    expect(agenda.some((r) => r.kind === 'item' && r.item.kind === 'note')).toBe(false)
    const bare = dayRows(state, state.days[0], 'agenda', { ...PRINT_DEFAULTS.agenda, breaks: false, markers: false }).rows
    expect(bare.map((r) => (r.kind === 'item' ? r.item.id : r.title))).toEqual(['Arrival', 'welcome', 'checkin'])
  })
  it('skips a group whose members are all hidden', () => {
    const only = { ...state, items: state.items.map((i) => (i.groupId ? { ...i, kind: 'note' as const, duration: 0 } : i)) }
    expect(dayRows(only, only.days[0], 'agenda', PRINT_DEFAULTS.agenda).rows.some((r) => r.kind === 'group')).toBe(false)
  })
})

describe('printOptions', () => {
  it('fills from the defaults and ignores junk', () => {
    expect(printOptions('agenda', null)).toEqual(PRINT_DEFAULTS.agenda)
    expect(printOptions('agenda', { lead: true, bogus: 1, goal: 'yes' })).toEqual({ ...PRINT_DEFAULTS.agenda, lead: true })
  })
})

describe('workshopMarkdown', () => {
  it('renders the moderation plan as sections with fields, notes demoted and an at-a-glance table', () => {
    const md = workshopMarkdown(state, 'plan', PRINT_DEFAULTS.plan, labels, date)
    expect(md).toContain('# Team day | Example Ltd\n\nPlan · Example Ltd · Room 2 · 2026-11-10\n\nAgree on three things.\n\n## Before\n- Projector')
    expect(md).toContain('## Tuesday 2026-11-10 · 09:00–11:00')
    expect(md).toContain('**At a glance**\n\n| Time | Duration | Content | Lead |')
    expect(md).toContain('**Arrival** · 09:00–09:45')
    expect(md).toContain('### 09:00–09:20 · 1. Welcome (20 min)\n\n- **Goal:** Everyone knows the plan\n- **Method:** Input\n- **Lead:** NH\n- **Category:** Input\n- **Material:** 2 × Flip chart\n- **Files:** slides.pdf\n\n##### Steps\n1. Say hello\n2. Show the | agenda')
    expect(md).toContain('> **Photo** – Shoot the charts')
    expect(md).toContain('*15 min free*\n\n### 10:00–11:00 · Lunch (1 h)')
    expect(md).toContain('**09:00 · Doors open**')
    expect(md).not.toContain('Packing list')
  })
  it('renders the client agenda as a table without internal fields, pipes escaped', () => {
    const md = workshopMarkdown(state, 'agenda', PRINT_DEFAULTS.agenda, labels, date)
    expect(md).toContain('| Time | Content |\n| --- | --- |\n| 09:00 | Doors open |\n| 09:00–09:45 | **ARRIVAL** |\n| 09:00–09:20 | **Welcome** |\n| 09:20–09:45 | **Check-in**<br>One sentence each |\n| 10:00–11:00 | Lunch |')
    expect(md).not.toMatch(/Goal|NH|Say hello|Photo|Projector/)
    expect(workshopMarkdown(state, 'overview', PRINT_DEFAULTS.overview, labels, date)).toContain('| 09:00–09:20 | 20 min | **Welcome** | Everyone knows the plan | Input | NH |')
    expect(workshopMarkdown(state, 'overview', { ...PRINT_DEFAULTS.overview, notes: true }, labels, date)).toContain('| ## Steps<br>1. Say hello<br>2. Show the \\| agenda |')
  })
  it('renders the packing list as a task list, and appends it to the plan on request', () => {
    expect(workshopMarkdown(state, 'packing', PRINT_DEFAULTS.packing, labels, date)).toContain('- [ ] Kit\n- [x] 2 × Flip chart\n')
    expect(workshopMarkdown(state, 'plan', { ...PRINT_DEFAULTS.plan, appendPacking: true }, labels, date)).toContain('## Packing list\n\n- [ ] Kit')
  })
})
