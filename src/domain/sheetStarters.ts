import { serializeSheetPage, type SheetBlock, type SheetHeader, type TextItem } from './sheetDoc.ts'
import type { SampleSet } from './sampleSets.ts'

/**
 * Starter sheets (docs/worksheets.md, section 7): the first page of "New worksheet", for everyone who may edit. Each
 * shows a way a sheet is meant to be built – a reflection, the instructions of an exercise, a handout, fields to fill,
 * a self-rating, a transfer plan – filled with one of the made-up subjects of the starter slides (sampleSets.ts), so
 * nobody takes it for content. They are code, not data: they follow the block catalogue and need no upkeep.
 */

export const SHEET_STARTERS = ['reflection', 'exercise', 'handout', 'fields', 'rating', 'transfer', 'blank'] as const
export type SheetStarter = (typeof SHEET_STARTERS)[number]

/** The fixed words of the starters, in the app's language. */
export interface StarterWords {
  worksheet: string
  handout: string
  ourResult: string
  rating: string
  resources: string
  strengthen: string
  tryOut: string
  dropNow: string
  notes: string
  blankTitle: string
}

export const STARTER_WORDS: Record<'de' | 'en', StarterWords> = {
  de: { worksheet: 'Arbeitsblatt', handout: 'Handout', ourResult: 'Unser Ergebnis:', rating: 'Einschätzung', resources: 'Was schon trägt …', strengthen: 'Was helfen könnte …', tryOut: 'Das probiere ich aus', dropNow: 'Das lasse ich ab jetzt weg', notes: 'Notizen', blankTitle: 'Titel' },
  en: { worksheet: 'Worksheet', handout: 'Handout', ourResult: 'Our result:', rating: 'Rating', resources: 'What already helps …', strengthen: 'What could help …', tryOut: 'What I will try', dropNow: 'What I will drop from now on', notes: 'Notes', blankTitle: 'Title' },
}

export const starterWords = (language: string): StarterWords => STARTER_WORDS[language.toLowerCase().startsWith('de') ? 'de' : 'en']

const c = (over: Partial<SheetBlock> = {}) => ({ mods: [], space: 0, lines: 0, fill: false, ...over })
const p = (cls: string, text: string): TextItem => ({ tag: 'p', cls, text, points: [] })
const head = (eyebrow: string, title: string, lead = ''): SheetHeader => ({ eyebrow, title, titleCls: '', leads: lead ? [lead] : [], picture: null })
const page = (header: SheetHeader | null, blocks: SheetBlock[]): string => serializeSheetPage({ landscape: false, header, blocks })

/** A starter sheet's title and pages, filled with a sample subject. */
export function starterSheet(kind: SheetStarter, s: SampleSet, w: StarterWords): { title: string; pages: string[] } {
  switch (kind) {
    case 'reflection':
      return {
        title: s.question,
        pages: [
          page(head(`${w.worksheet} · ${s.kicker}`, s.question, s.lead), [
            ...s.boxes.slice(0, 3).map((b) => c({ kind: 'question', mods: ['numbered'], lines: 3, title: b.title, plain: false, hint: b.text }) as SheetBlock),
            c({ kind: 'question', mods: ['numbered'], fill: true, title: s.boxes[3].title, plain: false, hint: s.boxes[3].text }) as SheetBlock,
          ]),
        ],
      }
    case 'exercise':
      return {
        title: s.exercise.title,
        pages: [
          page(head(`${w.worksheet} · ${s.exercise.tag}`, s.exercise.title, s.exercise.lead), [
            c({ kind: 'text', items: [p('hint', s.exercise.facts.map(([k, v]) => `**${k}:** ${v}`).join(' · '))] }) as SheetBlock,
            c({ kind: 'steps', steps: s.exercise.steps.map((x, i) => ({ title: x, time: '', body: i === 0 ? [p('hint', s.steps[0].text)] : [], room: null })) }) as SheetBlock,
            c({ kind: 'box', mods: ['round'], fill: true, items: [p('prompt quiet', w.ourResult)] }) as SheetBlock,
          ]),
        ],
      }
    case 'handout':
      return {
        title: s.title,
        pages: [
          page(head(`${w.handout} · ${s.kicker}`, s.title, s.lead), [
            c({ kind: 'terms', entries: s.points.map((x) => ({ term: x.title, text: x.text })) }) as SheetBlock,
            c({ kind: 'text', items: [{ tag: 'h3', cls: '', text: s.section.title, points: [] }, p('', s.section.text)] }) as SheetBlock,
          ]),
        ],
      }
    case 'fields':
      return {
        title: s.title,
        pages: [
          page(head(`${w.worksheet} · ${s.kicker}`, s.title, s.lead), [
            c({ kind: 'grid', mods: ['g-wide'], fill: true, fields: [{ mods: [], items: [p('prompt', s.question)] }, ...s.cells.map((x) => ({ mods: [], items: [p('prompt', `${x.title} …`)] }))] }) as SheetBlock,
          ]),
        ],
      }
    case 'rating':
      return {
        title: s.title,
        pages: [
          page(head(`${w.worksheet} · ${w.rating}`, s.title, s.lead), [
            c({ kind: 'criteria', fill: true, crits: s.points.slice(0, 4).map((x) => ({ label: w.rating, score: '/10', name: x.title, notes: [w.resources, w.strengthen], space: 0 })) }) as SheetBlock,
          ]),
        ],
      }
    case 'transfer':
      return {
        title: s.title,
        pages: [
          page(head(`${w.worksheet} · ${s.kicker}`, s.title, s.lead), [
            c({ kind: 'text', items: [{ tag: 'h3', cls: '', text: w.tryOut, points: [] }] }) as SheetBlock,
            c({ kind: 'ticks', items: ['', '', ''] }) as SheetBlock,
            c({ kind: 'question', lines: 2, title: w.dropNow, plain: false, hint: '' }) as SheetBlock,
            c({ kind: 'question', fill: true, title: w.notes, plain: false, hint: '' }) as SheetBlock,
          ]),
        ],
      }
    case 'blank':
      return { title: w.blankTitle, pages: [page(head(w.worksheet, w.blankTitle), [c({ kind: 'write', fill: true }) as SheetBlock])] }
  }
}
