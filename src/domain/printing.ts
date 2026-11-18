import { extensionOf } from './attachments.ts'
import { agendaOrder } from './order.ts'
import type { Item, ItemContent, Paper, PrintMode, PrintRule, Worksheet, WorkshopState } from './types.ts'

/**
 * Print rules and the print package (docs/worksheets.md, sections 2 and 3). A step says per file how many copies the
 * workshop needs; the package has one file per print job, named after the job, and a print list. PDFs attached to
 * steps are not read: their paper size and one- or two-sided are set by hand. Worksheets written in the app (stage 2)
 * take the same rule, keyed by the sheet's id; their paper is the sheet's, and the browser prints them job by job from
 * the print view, so they are vector PDFs as the accepted test print was.
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

/** What a rule can be kept for: the files a step links and its worksheets. */
export const printKeys = (c: Pick<ItemContent, 'attachmentIds' | 'worksheets'>): string[] => [...c.attachmentIds, ...(c.worksheets ?? []).map((w) => w.id)]

/** The rules of what a step still holds (its files, its sheets): what an unlinked file or a removed sheet had goes with it. */
export const rulesOfLinked = (rules: Record<string, PrintRule>, keys: string[]): Record<string, PrintRule> => mapRules(rules, (id) => (keys.includes(id) ? id : undefined))

/**
 * A step's worksheets copied with ids of their own, and its print rules keyed anew: a sheet's rule follows it to its
 * new id, a file's to the id `files` gives it (the same id where the files stay, as in a duplicate on the same day).
 */
export function copyPrinted(c: Pick<ItemContent, 'worksheets' | 'printRules'>, files: (id: string) => string | undefined, newId: () => string): { worksheets: Worksheet[]; printRules: Record<string, PrintRule> } {
  const ids = new Map<string, string>()
  const worksheets = (c.worksheets ?? []).map((w) => {
    const id = newId()
    ids.set(w.id, id)
    return { ...w, id, pages: w.pages.map((p) => ({ ...p, id: newId() })) }
  })
  return { worksheets, printRules: mapRules(c.printRules, (id) => ids.get(id) ?? files(id)) }
}

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
  /** A PDF attached to the step (into the package), or a worksheet written in the app (printed from the print view). */
  kind: 'file' | 'sheet'
  itemId: string
  itemTitle: string
  /** The attachment's id, or the sheet's. */
  id: string
  /** The file's name, or the sheet's title. */
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
 * What the workshop prints, in agenda order: every PDF a placed step links and every worksheet it has, with a rule
 * other than off (a step's files first, then its sheets). Parked steps and notes print nothing; a rule asking for no
 * copies is left out. `participants` stands in for the workshop's number (the export asks for it when it is
 * missing); `reserve` is added to every job.
 */
export function printLines(state: WorkshopState, options: { participants?: number | null; reserve?: number } = {}): PrintLine[] {
  const participants = options.participants ?? state.workshop.participants ?? null
  const reserve = Math.max(0, options.reserve ?? 0)
  const lines: PrintLine[] = []
  for (const item of agendaOrder(state.days, state)) {
    if (item.kind === 'note') continue
    const add = (kind: PrintLine['kind'], id: string, name: string, paper: Paper) => {
      const rule = ruleOf(item, id)
      if (rule.mode === 'off') return
      const copies = copiesOf(rule, participants, item.groups ?? 1)
      if (copies === 0) return
      lines.push({ kind, itemId: item.id, itemTitle: item.title, id, name, rule: { ...rule, paper }, groups: item.groups ?? 1, copies, job: copies === null ? null : { copies: copies + reserve, paper, duplex: rule.duplex } })
    }
    for (const id of item.attachmentIds) {
      const file = state.attachments.find((a) => a.id === id)
      if (file && isPrintable(file.name)) add('file', id, file.name, ruleOf(item, id).paper)
    }
    // a worksheet's paper is its own
    for (const sheet of item.worksheets ?? []) add('sheet', sheet.id, sheet.title, sheet.paper)
  }
  return lines
}

/** The key of a print job, for addresses: "30-A4-1" (one-sided) or "30-A4-2". */
export const jobKey = (job: PrintJob): string => `${job.copies}-${job.paper}-${job.duplex ? 2 : 1}`

/** The worksheets of the workshop grouped by their print job, in the order the jobs first come up in the agenda. */
export function sheetJobs(lines: PrintLine[]): { key: string; job: PrintJob; lines: PrintLine[] }[] {
  const jobs = new Map<string, { key: string; job: PrintJob; lines: PrintLine[] }>()
  for (const l of lines) {
    if (l.kind !== 'sheet' || !l.job) continue
    const key = jobKey(l.job)
    if (!jobs.has(key)) jobs.set(key, { key, job: l.job, lines: [] })
    jobs.get(key)!.lines.push(l)
  }
  return [...jobs.values()]
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
  /** The print list's note on worksheets: they are not in the package. */
  sheetsApart: string
  /** The print list's column of where a line comes from. */
  source: string
  file: string
  appSheet: string
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
    sheetsApart: 'Arbeitsblätter aus der App sind nicht im Paket: Ausgabe → Druckpaket, dort je Auftrag „Drucken“ und im Druckdialog als PDF speichern.',
    source: 'Quelle',
    file: 'Datei',
    appSheet: 'Arbeitsblatt',
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
    sheetsApart: 'Worksheets written in the app are not in the package: Output → Print package, "Print" per job, and save as PDF in the print dialog.',
    source: 'Source',
    file: 'File',
    appSheet: 'Worksheet',
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

/** The title of a job's print view, which the browser offers as the PDF's name: "30x A4 einseitig – Teamtag". */
export const jobTitle = (job: PrintJob, workshopTitle: string, w: PrintWords): string => `${jobLabel(job, w)} – ${workshopTitle || w.untitled}`

/** The name of a file in the package: the job, then the file's own name ("30x A4 einseitig – Handout.pdf"). */
export const packageFileName = (line: PrintLine, w: PrintWords): string => (line.job ? `${jobLabel(line.job, w)} – ${line.name}` : line.name)

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()

/** The print list as Markdown: sheet, step, rule, copies, job. */
export function printListMarkdown(state: WorkshopState, lines: PrintLine[], w: PrintWords, reserve = 0): string {
  const out = [`# ${w.printList} – ${cell(state.workshop.title) || w.untitled}`, '']
  if (reserve > 0) out.push(w.reserve(reserve), '')
  if (lines.some((l) => l.kind === 'sheet')) out.push(w.sheetsApart, '')
  out.push(`| ${w.sheet} | ${w.source} | ${w.step} | ${w.rule} | ${w.copies} | ${w.job} |`, '|---|---|---|---|---:|---|')
  for (const l of lines) out.push(`| ${cell(l.name)} | ${l.kind === 'sheet' ? w.appSheet : w.file} | ${cell(l.itemTitle) || w.untitled} | ${ruleLabel(l, w)} | ${l.copies ?? '?'} | ${l.job ? jobLabel(l.job, w) : '?'} |`)
  return `${out.join('\n')}\n`
}
