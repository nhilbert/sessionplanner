import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { type AssetScope, SlideView } from '../SlideView'
import { blankSlide } from '../templates'
import { LAYOUTS, type LayoutGroup } from '@/domain/slideDoc'
import { cx, Modal } from '@/components/ui'
import { tr } from './fields'

const GROUPS: LayoutGroup[] = ['text', 'structure', 'visual', 'opening']

/** The catalogue as a grid: every layout as a small blank slide in the current theme, with its name and what it is for. */
export function LayoutGrid({ current, onPick, theme, scope, columns = 'grid-cols-2 md:grid-cols-3' }: { current?: string; onPick: (layout: string) => void; theme: string; scope: AssetScope; columns?: string }) {
  const { t } = useTranslation()
  const blanks = useMemo(() => Object.fromEntries(LAYOUTS.map((l) => [l.id, blankSlide(l.id, t)])), [t])
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <section key={group}>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{tr(t, `slides.layoutGroups.${group}`)}</div>
          <ul className={cx('grid gap-2.5', columns)}>
            {LAYOUTS.filter((l) => l.group === group).map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => onPick(l.id)} className={cx('block w-full rounded-lg p-1 text-left ring-offset-2 ring-offset-surface transition-colors hover:bg-surface-2', l.id === current && 'ring-2 ring-accent')} aria-pressed={l.id === current} aria-label={tr(t, `slides.layouts.${l.id}`)}>
                  <SlideView html={blanks[l.id]} theme={theme} scope={scope} />
                  <div className="mt-1 px-0.5">
                    <div className="truncate text-[13px] font-medium">{tr(t, `slides.layouts.${l.id}`)}</div>
                    <div className="truncate text-[11px] text-ink-3">{l.generated ? t('slides.generatedHint').split(';')[0] : tr(t, `slides.layoutUse.${l.id}`)}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function LayoutPicker({ open, onClose, current, onPick, theme, scope }: { open: boolean; onClose: () => void; current: string; onPick: (layout: string) => void; theme: string; scope: AssetScope }) {
  const { t } = useTranslation()
  return (
    <Modal open={open} onClose={onClose} width="max-w-4xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[6vh]">
      <h2 className="mb-3 text-[16px] font-semibold">{t('editor.changeLayout')}</h2>
      <LayoutGrid
        current={current}
        theme={theme}
        scope={scope}
        onPick={(l) => {
          onPick(l)
          onClose()
        }}
      />
    </Modal>
  )
}
