import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button, SectionLabel, Segmented } from '@/components/ui'
import { reportFailure } from '@/api'
import { offlineClearsOnSignOut } from '@/features'
import { formatDateRange } from '@/i18n'
import { formatStamp } from './OfflineNotice'
import { clearOfflineCopy, KEPT_CHANGED, keptDetails, type KeptWorkshop, offlineOn, offlineSupported, setPinned, turnOfflineOn } from './client'

/**
 * The switch for the offline copy on this device (docs/offline.md): off by default, as a shared laptop must not keep
 * clients' workshops unasked; once on, it works by itself. Below it what the copy holds, why and as of when, and the
 * pins to let go of (as Notion's Offline tab and Google Drive's offline preview show it).
 */
export default function OfflineSection() {
  const { t } = useTranslation()
  const [on, setOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [kept, setKept] = useState<KeptWorkshop[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    void offlineOn().then((v) => live && setOn(v))
    return () => {
      live = false
    }
  }, [])
  useEffect(() => {
    if (!on || busy) return setKept(null)
    let live = true
    const load = () => void keptDetails().then((k) => live && setKept(k), () => undefined)
    load()
    window.addEventListener(KEPT_CHANGED, load)
    return () => {
      live = false
      window.removeEventListener(KEPT_CHANGED, load)
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
  // The oldest copy says as of when all of it is at least.
  const at = kept?.reduce<string | null>((min, k) => (k.at && (!min || k.at < min) ? k.at : min), null) ?? null

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
        <span className="text-[13px] text-ink-3">{busy ? t('offline.working') : on ? (kept ? t('offline.holds', { count: kept.length, at: at ? formatStamp(at) : '–' }) : '…') : t('offline.offHint')}</span>
      </div>
      {failed && <p className="mt-2 text-[13px] text-rose">{t('offline.failed')}</p>}
      <p className="mt-3 text-[13px] text-ink-3">{t(offlineClearsOnSignOut() ? 'offline.hintSignOut' : 'offline.hint')}</p>
      {on && kept && (
        <div className="mt-4">
          <div className="mb-1 text-[13px] font-semibold text-ink-2">{t('offline.keptTitle')}</div>
          {kept.length === 0 ? (
            <p className="text-[13px] text-ink-3">{t('offline.keptEmpty')}</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {kept.map((k) => (
                <li key={k.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="w-[6.5rem] shrink-0 text-ink-2 tnum">{k.firstDate ? formatDateRange(k.firstDate, k.lastDate, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–'}</span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/w/${k.id}`} className="block truncate font-semibold hover:underline">
                      {k.title || t('workshops.untitled')}
                    </Link>
                    <div className="truncate text-[12px] text-ink-3">
                      {k.reasons.map((r) => t(`offline.reasons.${r}`)).join(' · ')}
                      {k.at && ` · ${t('offline.asOf', { at: formatStamp(k.at) })}`}
                    </div>
                  </div>
                  {k.reasons.includes('pinned') && (
                    <Button size="sm" variant="ghost" className="shrink-0" onClick={() => void setPinned(k.id, false).catch(reportFailure)}>
                      {t('offline.release')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
