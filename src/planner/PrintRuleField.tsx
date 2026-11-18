import { useTranslation } from 'react-i18next'
import { PAPERS, PRINT_MODES, type Paper, type PrintMode, type PrintRule } from '@/domain/types'
import { QtyField } from './fields'

/**
 * How many copies of a file a workshop prints (docs/worksheets.md, section 2): one choice. A number shows only where
 * the choice needs one – the step's groups beside "per group", the count beside "count" – and paper size and one- or
 * two-sided sit behind a disclosure.
 */
export function PrintRuleField({ name, rule, groups, participants, paper, onRule, onGroups }: { name: string; rule: PrintRule; groups: number; participants: number | null; /** A worksheet's own paper: then only one- or two-sided can be chosen. */ paper?: Paper; onRule: (rule: PrintRule) => void; onGroups: (groups: number) => void }) {
  const { t } = useTranslation()
  const set = (patch: Partial<PrintRule>) => onRule({ ...rule, ...patch })
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      <select className="field h-7 w-auto py-0 pr-7 text-[12px]" aria-label={t('printRule.label', { name })} value={rule.mode} onChange={(e) => set({ mode: e.target.value as PrintMode })}>
        {PRINT_MODES.map((m) => (
          <option key={m} value={m}>
            {t(`printRule.${m}`)}
          </option>
        ))}
      </select>
      {rule.mode === 'group' && (
        <label className="inline-flex items-center gap-1 text-ink-2">
          ×
          <QtyField value={groups} aria-label={t('printRule.groups')} min={1} max={500} onChange={(n) => onGroups(Math.min(500, Math.max(1, n)))} className="field h-7 w-14 py-0 text-[12px]" />
        </label>
      )}
      {rule.mode === 'count' && <QtyField value={rule.count ?? 1} aria-label={t('printRule.count')} max={10_000} onChange={(n) => set({ count: Math.min(10_000, n) })} className="field h-7 w-16 py-0 text-[12px]" />}
      {rule.mode === 'person' && participants == null && <span className="text-amber">{t('printRule.noParticipants')}</span>}
      {rule.mode !== 'off' && (
        <details className="group">
          <summary className="cursor-pointer list-none text-ink-3 hover:text-ink">
            {paper ?? rule.paper} · {rule.duplex ? t('printRule.twoSided') : t('printRule.oneSided')}
          </summary>
          <div className="mt-1 flex items-center gap-3">
            {!paper && (
              <select className="field h-7 w-auto py-0 pr-7 text-[12px]" aria-label={t('printRule.paper')} value={rule.paper} onChange={(e) => set({ paper: e.target.value as Paper })}>
                {PAPERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}
            <label className="inline-flex items-center gap-1 text-ink-2">
              <input type="checkbox" checked={rule.duplex} onChange={(e) => set({ duplex: e.target.checked })} />
              {t('printRule.twoSided')}
            </label>
          </div>
        </details>
      )}
    </div>
  )
}
