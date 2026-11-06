import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import { SectionLabel } from '@/components/ui'
import { formatSize } from '@/planner/fields'

/** From here on the bar warns: uploads will be refused soon. */
const NEARLY_FULL = 0.9

/** How much the workspace's files take up. There from the first moment, so the page does not move when the numbers arrive. */
export default function StorageSection() {
  const { t } = useTranslation()
  const [storage, setStorage] = useState<{ used: number; limit: number | null } | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    api.storage().then(
      (s) => live && setStorage(s),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [])
  const share = storage?.limit ? Math.min(1, storage.used / storage.limit) : null
  const line = failed
    ? t('settings.storageFailed')
    : !storage
      ? '…'
      : storage.limit
        ? t('settings.storageUsedOf', { used: formatSize(storage.used), limit: formatSize(storage.limit) })
        : t('settings.storageUsed', { used: formatSize(storage.used) })
  return (
    <section className="card mb-6 p-5">
      <SectionLabel>{t('settings.storage')}</SectionLabel>
      <p className="text-[14px] text-ink-2">{line}</p>
      {share !== null && (
        <div role="progressbar" aria-label={t('settings.storage')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className={share >= NEARLY_FULL ? 'h-full bg-amber' : 'h-full bg-accent'} style={{ width: `${share * 100}%` }} />
        </div>
      )}
      <p className="mt-2 text-[13px] text-ink-3">{share !== null && share >= NEARLY_FULL ? t('settings.storageNearlyFull') : t('settings.storageHint')}</p>
    </section>
  )
}
