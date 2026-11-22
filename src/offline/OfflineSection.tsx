import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SectionLabel, Segmented } from '@/components/ui'
import { offlineClearsOnSignOut } from '@/features'
import { formatStamp } from './OfflineNotice'
import { clearOfflineCopy, offlineOn, offlineSummary, offlineSupported, turnOfflineOn } from './client'

/**
 * The switch for the offline copy on this device (docs/offline.md): off by default, as a shared laptop must not keep
 * clients' workshops unasked; once on, it works by itself.
 */
export default function OfflineSection() {
  const { t } = useTranslation()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<{ workshops: number; at: string | null } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    void offlineOn().then((v) => live && setOn(v))
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    if (!on || busy) return setSummary(null)
    let live = true
    void offlineSummary().then((s) => live && setSummary(s))
    return () => {
      live = false
    }
  }, [on, busy])

  if (!offlineSupported()) return null
  const change = async (next: 'on' | 'off') => {
    if (busy || (next === 'on') === on) return
    setBusy(true)
    setFailed(false)
    try {
      if (next === 'on') await turnOfflineOn()
      else await clearOfflineCopy()
      setOn(next === 'on')
    } catch {
      setFailed(true)
      setOn(await offlineOn())
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card mb-6 p-5">
      <SectionLabel>{t('offline.title')}</SectionLabel>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          value={on ? 'on' : 'off'}
          onChange={(v) => void change(v)}
          options={[
            { value: 'off', label: t('offline.off') },
            { value: 'on', label: t('offline.on') },
          ]}
        />
        <span className="text-[13px] text-ink-3">{busy ? t('offline.working') : on ? (summary ? t('offline.holds', { count: summary.workshops, at: summary.at ? formatStamp(summary.at) : '–' }) : '…') : t('offline.offHint')}</span>
      </div>
      {failed && <p className="mt-2 text-[13px] text-rose">{t('offline.failed')}</p>}
      <p className="mt-3 text-[13px] text-ink-3">{t(offlineClearsOnSignOut() ? 'offline.hintSignOut' : 'offline.hint')}</p>
    </section>
  )
}
