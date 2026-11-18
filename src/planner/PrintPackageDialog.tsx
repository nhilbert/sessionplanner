import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import type { Op } from '@/domain/ops'
import { jobLabel, needsParticipants, printLines, printWords } from '@/domain/printing'
import type { WorkshopState } from '@/domain/types'
import { Button, Field, Input, Modal } from '@/components/ui'

const RESERVE_KEY = 'sp.print.reserve'

function storedReserve(): number {
  try {
    const n = Number(localStorage.getItem(RESERVE_KEY))
    return Number.isInteger(n) && n >= 0 && n <= 100 ? n : 0
  } catch {
    return 0
  }
}

function storeReserve(n: number) {
  try {
    if (n) localStorage.setItem(RESERVE_KEY, String(n))
    else localStorage.removeItem(RESERVE_KEY)
  } catch {
    /* storage blocked */
  }
}

/**
 * The print package (docs/worksheets.md, section 3): what the workshop prints, a reserve per job (remembered on this
 * device) and, when a rule is per person and the workshop has no number of participants, that number first, which the
 * workshop then keeps (the planner is open only to who may edit it).
 */
export function PrintPackageDialog({ data, open, change, onClose }: { data: WorkshopState; open: boolean; change: (ops: Op[]) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [reserve, setReserve] = useState(0)
  const [participants, setParticipants] = useState('')
  useEffect(() => {
    if (!open) return
    setReserve(storedReserve())
    setParticipants('')
  }, [open])
  const asking = needsParticipants(data)
  const typed = Number(participants)
  const valid = !asking || (Number.isInteger(typed) && typed >= 1 && typed <= 10_000)
  const lines = printLines(data, { participants: asking && valid ? typed : undefined, reserve })
  const w = printWords(i18n.language)

  const download = () => {
    storeReserve(reserve)
    if (asking) change([{ op: 'set', entity: 'workshop', id: data.workshop.id, fields: { participants: typed } }])
    const a = document.createElement('a')
    a.href = api.printPackageUrl(data.workshop.id, { participants: asking ? typed : undefined, reserve, lang: i18n.language === 'de' ? 'de' : 'en' })
    a.download = ''
    a.click()
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid && lines.length) download()
        }}
      >
        <h2 className="text-lg font-medium">{t('printPackage.title')}</h2>
        {!lines.length ? (
          <p className="text-[14px] text-ink-2">{t('printPackage.empty')}</p>
        ) : (
          <>
            {asking && (
              <Field label={t('printPackage.participants')} hint={t('printPackage.participantsKept')}>
                <Input autoFocus type="number" inputMode="numeric" min={1} max={10_000} required value={participants} onChange={(e) => setParticipants(e.target.value)} />
              </Field>
            )}
            <ul className="max-h-[40vh] divide-y divide-line overflow-auto text-[13px]">
              {lines.map((l) => (
                <li key={`${l.itemId}:${l.attachmentId}`} className="flex items-baseline gap-3 py-1.5">
                  <span className="w-36 shrink-0 tnum text-ink-2">{l.job ? jobLabel(l.job, w) : '–'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{l.name}</span>
                    <span className="block truncate text-[11px] text-ink-3">{l.itemTitle || t('workshops.untitled')}</span>
                  </span>
                </li>
              ))}
            </ul>
            <Field label={t('printPackage.reserve')} hint={t('printPackage.reserveHint')}>
              <Input type="number" inputMode="numeric" min={0} max={100} value={String(reserve)} onChange={(e) => setReserve(Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))))} className="w-24" />
            </Field>
            <p className="text-[13px] text-ink-3">{t('printPackage.hint')}</p>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={!lines.length || !valid}>
            {t('printPackage.download')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
