import { useTranslation } from 'react-i18next'
import type { WorkshopState } from '@/domain/types'
import { agendaOrder } from '@/domain/order'
import { packingList } from '@/domain/packing'
import { cx } from '@/components/ui'
import { Tick } from './common'

/** The packing list with a box per line, the quantity to pack, and which steps need it. */
export function PackingSheet({ data }: { data: WorkshopState }) {
  const { t } = useTranslation()
  const lines = packingList(agendaOrder(data.days, data), data.workshop.packing, data.workshop.materials)
  const titleOf = (id: string) => data.items.find((i) => i.id === id)?.title ?? ''
  if (!lines.length) return <p className="text-black/60">{t('packing.empty')}</p>
  return (
    <table className="w-full max-w-[160mm] border-collapse text-[13px] leading-[1.4]">
      <tbody>
        {lines.map((l) => {
          const usedIn = l.itemIds.map(titleOf).filter(Boolean)
          return (
            <tr key={l.key} className={cx('border-b border-black/10', l.state.venue && 'text-black/50')}>
              <td className="w-8 py-2 align-top">{l.state.checked ? <span className="text-[15px] leading-none">☑</span> : <Tick large className="mt-[2px]" />}</td>
              <td className="w-12 py-2 pr-3 text-right align-top tnum">{l.qty}</td>
              <td className="py-2 align-top">
                <div>{l.label}</div>
                {usedIn.length > 0 && <div className="text-[11px] text-black/55">{t('print.usedIn', { items: usedIn.join(', ') })}</div>}
                {l.links.map((link) => (
                  <div key={link} className="text-[11px] text-black/55">
                    {link}
                  </div>
                ))}
              </td>
              <td className="py-2 pl-3 text-right align-top text-[11px] text-black/55">{l.state.venue ? t('packing.venue') : ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
