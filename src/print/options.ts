import { useState } from 'react'
import type { TFunction } from 'i18next'
import type { Category } from '@/domain/types'
import { PRINT_DEFAULTS, type PrintLabels, type PrintOptions, type PrintVariant, printOptions } from '@/domain/print'
import { categoryName } from '@/store/useSettings'

const key = (variant: PrintVariant) => `sp.print.${variant}`

/** The switches of one print view, remembered per device (storage may be missing or blocked: then they are not). */
export function usePrintOptions(variant: PrintVariant) {
  const [options, setOptions] = useState<PrintOptions>(() => {
    try {
      return printOptions(variant, JSON.parse(localStorage.getItem(key(variant)) ?? 'null'))
    } catch {
      return PRINT_DEFAULTS[variant]
    }
  })
  const store = (next: PrintOptions | null) => {
    try {
      if (next) localStorage.setItem(key(variant), JSON.stringify(next))
      else localStorage.removeItem(key(variant))
    } catch {
      // not remembered
    }
  }
  const update = (patch: Partial<PrintOptions>) =>
    setOptions((o) => {
      const next = { ...o, ...patch }
      store(next)
      return next
    })
  const reset = () => {
    store(null)
    setOptions(PRINT_DEFAULTS[variant])
  }
  const changed = (Object.keys(options) as (keyof PrintOptions)[]).some((k) => options[k] !== PRINT_DEFAULTS[variant][k])
  return { options, update, reset, changed }
}

/** The Markdown's labels in the UI's language. */
export function printLabels(t: TFunction, variant: PrintVariant, categories: Category[]): PrintLabels {
  return {
    variant: t(`print.${variant}`),
    untitled: t('workshops.untitled'),
    day: (n) => t('print.day', { n }),
    time: t('print.time'),
    duration: t('print.duration'),
    content: t('print.content'),
    goal: t('print.goal'),
    method: t('print.method'),
    lead: t('print.lead'),
    category: t('print.category'),
    material: t('print.material'),
    files: t('print.files'),
    notes: t('print.notes'),
    packing: t('print.packing'),
    venue: t('packing.venue'),
    dayOverview: t('print.dayOverview'),
    gap: (d) => t('planner.gap', { d }),
    overlap: (d) => t('planner.overlap', { d }),
    late: (time) => t('planner.late', { time }),
    categoryOf: (item) => {
      const c = categories.find((x) => x.id === item.categoryId)
      return c ? categoryName(c, t) : null
    },
  }
}

/** Offers a text as a file to save. */
export function downloadText(name: string, text: string, type = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** "Teamklausur Bereich Service" → "teamklausur-bereich-service". */
export const fileSlug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workshop'
