import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'
import i18n from '@/i18n'
import { usePlanner } from '@/store/usePlanner'
import { useOffline } from './state'

/** A time the copy was stored, as the notices say it: weekday, date and clock time. */
export const formatStamp = (at: string): string => {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return at
  return d.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** The bar over every page while the app shows the offline copy (docs/offline.md). */
export function OfflineBar() {
  const { t } = useTranslation()
  // The open workshop's own time counts first: it is what the page shows.
  const workshop = usePlanner((s) => s.offlineAt)
  const any = useOffline((s) => s.since)
  const since = workshop ?? any
  if (!since) return null
  return (
    <div role="status" className="no-print flex items-center gap-2 bg-amber-soft px-4 py-2 text-[13px] text-amber md:px-6">
      <WifiOff size={14} className="shrink-0" />
      {t('offline.bar', { at: formatStamp(since) })}
    </div>
  )
}
