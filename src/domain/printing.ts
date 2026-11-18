import { extensionOf } from './attachments.ts'
import { agendaOrder } from './order.ts'
import type { Item, Paper, PrintMode, PrintRule, WorkshopState } from './types.ts'

/**
 * Print rules and the print package (docs/worksheets.md, sections 2 and 3). A step says per file how many copies the
 * workshop needs; the package has one file per print job, named after the job, and a print list. Stage 0 prints PDFs
 * attached to steps: they are not read, so paper size and one- or two-sided are set by hand.
 */

export const DEFAULT_PRINT_RULE: PrintRule = { mode: 'off', paper: 'A4', duplex: false }

/** Files that can carry a print rule: PDFs (stage 0). */
export const isPrintable = (name: string): boolean => extensionOf(name) === 'pdf'

export const ruleOf = (item: Pick<Item, 'printRules'>, attachmentId: string): PrintRule => item.printRules?.[attachmentId] ?? DEFAULT_PRINT_RULE

/** The rules with this file's rule changed: a rule that prints nothing on A4 one-sided is left out, so the record stays lean. */
export function withRule(rules: Record<string, PrintRule>, attachmentId: string, rule: PrintRule): Record<string, PrintRule> {
  const { [attachmentId]: _old, ...rest } = rules
  const clean: PrintRule = { mode: rule.mode, paper: rule.paper, duplex: rule.duplex, ...(rule.mode === 'count' ? { count: rule.count ?? 1 } : {}) }
  return clean.mode === 'off' && clean.paper === 'A4' && !clean.duplex ? rest : { ...rest, [attachmentId]: clean }
}

/**
 * The rules for files given new ids (a library entry inserted or saved, a step or workshop duplicated): each follows
 * its file; a rule whose file did not come along goes.
 */
export function mapRules(rules: Record<string, PrintRule> | undefined, to: (id: string) => string | undefined): Record<string, PrintRule> {
  const out: Record<string, PrintRule> = {}
  for (const [id, rule] of Object.entries(rules ?? {})) {
    const next = to(id)
    if (next) out[next] = rule
  }
  return out
}

/** The rules of the files a step still links: what an unlinked file had goes with it. */
export const rulesOfLinked = (rules: Record<string, PrintRule>, attachmentIds: string[]): Record<string, PrintRule> => mapRules(rules, (id) => (attachmentIds.includes(id) ? id : undefined))

/** Copies a rule asks for, before any reserve; null when it is per person and the number of participants is not known. */
export function copiesOf(rule: PrintRule, participants: number | null, groups: number): number | null {
  switch (rule.mode) {
    case 'person':
      return participants
    case 'group':
      return Math.max(1, groups || 1)
    case 'once':
      return 1
    case 'count':
      return Math.max(0, rule.count ?? 1)
    default:
      return 0
  }
}

/** What a copy shop is told once: copies × paper × one- or two-sided. */
export interface PrintJob {
  copies: number
  paper: Paper
  duplex: boolean
}

export interface PrintLine {
  itemId: string
  itemTitle: string
  attachmentId: string
  name: string
  rule: PrintRule
  groups: number
  /** As the rule asks, without the reserve; null when it needs the number of participants. */
  copies: number | null
  /** With the reserve; null as copies. */
  job: PrintJob | null
}

/** Whether printing the workshop needs the number of participants and it is not set. */
export const needsParticipants = (state: WorkshopState): boolean => state.workshop.participants == null && printLines(state).some((l) => l.copies === null)

/**
 * What the workshop prints, in agenda order: every PDF a placed step links with a rule other than off. Parked steps
 * and notes print nothing; a rule asking for no copies is left out. `participants` stands in for the workshop's
 * number (the export asks for it when it is missing); `reserve` is added to every job.
 */
export function printLines(state: WorkshopState, options: { participants?: number | null; reserve?: number } = {}): PrintLine[] {
  const participants = options.participants ?? state.workshop.participants ?? null
  const reserve = Math.max(0, options.reserve ?? 0)
  const lines: PrintLine[] = []
  for (const item of agendaOrder(state.days, state)) {
    if (item.kind === 'note') continue
    for (const id of item.attachmentIds) {
      const file = state.attachments.find((a) => a.id === id)
      const rule = ruleOf(item, id)
      if (!file || !isPrintable(file.name) || rule.mode === 'off') continue
      const copies = copiesOf(rule, participants, item.groups ?? 1)
      if (copies === 0) continue
      lines.push({
        itemId: item.id,
        itemTitle: item.title,
        attachmentId: id,
        name: file.name,
        rule,
        groups: item.groups ?? 1,
        copies,
        job: copies === null ? null : { copies: copies + reserve, paper: rule.paper, duplex: rule.duplex },
      })
    }
  }
  return lines
}

/** A sheet in the packing list: what a placed step prints, the copies as the rule asks (no reserve). */
export const sheetsToPack = (state: WorkshopState): { itemId: string; label: string; qty: number | null }[] =>
  printLines(state).map((l) => ({ itemId: l.itemId, label: l.name, qty: l.copies }))

// ---- words of the package: it is written on the server, which has no translations, so they live here -------------

export type PrintLocale = 'de' | 'en'

export interface PrintWords {
  oneSided: string
  twoSided: string
  modes: Record<Exclude<PrintMode, 'off'>, string>
  printList: string
  sheet: string
  step: string
  rule: string
  copies: string
  job: string
  reserve: (n: number) => string
  untitled: string
}

export const PRINT_WORDS: Record<PrintLocale, PrintWords> = {
  de: {
    oneSided: 'einseitig',
    twoSided: 'doppelseitig',
    modes: { person: 'pro Person', group: 'pro Gruppe', once: 'einmal', count: 'Anzahl' },
    printList: 'Druckliste',
    sheet: 'Blatt',
    step: 'Agendapunkt',
    rule: 'Regel',
    copies: 'Anzahl',
    job: 'Auftrag',
    reserve: (n) => `Jeder Auftrag mit ${n} Reserve.`,
    untitled: 'Ohne Titel',
  },
  en: {
    oneSided: 'single-sided',
    twoSided: 'double-sided',
    modes: { person: 'per person', group: 'per group', once: 'once', count: 'count' },
    printList: 'Print list',
    sheet: 'Sheet',
    step: 'Step',
    rule: 'Rule',
    copies: 'Copies',
    job: 'Job',
    reserve: (n) => `Every job with ${n} spare.`,
    untitled: 'Untitled',
  },
}

export const printWords = (locale: string | undefined): PrintWords => PRINT_WORDS[locale === 'de' ? 'de' : 'en']

/** "30x A4 einseitig" */
export const jobLabel = (job: PrintJob, w: PrintWords): string => `${job.copies}x ${job.paper} ${job.duplex ? w.twoSided : w.oneSided}`

/** "pro Gruppe (3)", "Anzahl 5", "pro Person" */
export function ruleLabel(line: Pick<PrintLine, 'rule' | 'groups'>, w: PrintWords): string {
  const { rule } = line
  if (rule.mode === 'off') return ''
  if (rule.mode === 'group') return `${w.modes.group} (${line.groups})`
  if (rule.mode === 'count') return `${w.modes.count} ${rule.count ?? 1}`
  return w.modes[rule.mode]
}

/** The name of a file in the package: the job, then the file's own name ("30x A4 einseitig – Handout.pdf"). */
export const packageFileName = (line: PrintLine, w: PrintWords): string => (line.job ? `${jobLabel(line.job, w)} – ${line.name}` : line.name)

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()

/** The print list as Markdown: sheet, step, rule, copies, job. */
export function printListMarkdown(state: WorkshopState, lines: PrintLine[], w: PrintWords, reserve = 0): string {
  const out = [`# ${w.printList} – ${cell(state.workshop.title) || w.untitled}`, '']
  if (reserve > 0) out.push(w.reserve(reserve), '')
  out.push(`| ${w.sheet} | ${w.step} | ${w.rule} | ${w.copies} | ${w.job} |`, '|---|---|---|---:|---|')
  for (const l of lines) out.push(`| ${cell(l.name)} | ${cell(l.itemTitle) || w.untitled} | ${ruleLabel(l, w)} | ${l.copies ?? '?'} | ${l.job ? jobLabel(l.job, w) : '?'} |`)
  return `${out.join('\n')}\n`
}
