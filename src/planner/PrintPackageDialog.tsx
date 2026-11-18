import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Printer } from 'lucide-react'
import { api } from '@/api'
import type { Op } from '@/domain/ops'
import { pageUrl } from '@/domain/addresses'
import { jobLabel, needsParticipants, printLines, printWords, sheetJobs } from '@/domain/printing'
import type { WorkshopState } from '@/domain/types'
import { Button, Field, Input, Modal, SectionLabel } from '@/components/ui'

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
 * workshop then keeps (the planner is open only to who may edit it). PDFs attached to steps come as a ZIP with a file
 * per job and the print list; worksheets written in the app are printed job by job from the print view, whose title is
 * the job, so the browser's "Save as PDF" names the file after it.
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
  const files = lines.filter((l) => l.kind === 'file')
  const jobs = sheetJobs(lines)
  const w = printWords(i18n.language)
  const lang = i18n.language === 'de' ? 'de' : 'en'

  /** What every way out does first: keep the reserve here and the number of participants on the workshop. */
  const keep = () => {
    storeReserve(reserve)
    if (asking && valid) change([{ op: 'set', entity: 'workshop', id: data.workshop.id, fields: { participants: typed } }])
  }
  const download = () => {
    keep()
    const a = document.createElement('a')
    a.href = api.printPackageUrl(data.workshop.id, { participants: asking ? typed : undefined, reserve, lang })
    a.download = ''
    a.click()
  }
  const printJob = (key: string) => {
    keep()
    const q = new URLSearchParams({ job: key, ...(reserve ? { reserve: String(reserve) } : {}), ...(asking ? { participants: String(typed) } : {}) })
    window.open(pageUrl(`/w/${data.workshop.id}/print/sheets?${q}`), '_blank', 'noopener')
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div className="space-y-4">
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
            <Field label={t('printPackage.reserve')} hint={t('printPackage.reserveHint')}>
              <Input type="number" inputMode="numeric" min={0} max={100} value={String(reserve)} onChange={(e) => setReserve(Math.min(100, Math.max(0, Math.round(Number(e.target.value) || 0))))} className="w-24" />
            </Field>
            {files.length > 0 && (
              <section>
                <SectionLabel>{t('printPackage.files')}</SectionLabel>
                <ul className="divide-y divide-line text-[13px]">
                  {files.map((l) => (
                    <li key={`${l.itemId}:${l.id}`} className="flex items-baseline gap-3 py-1.5">
                      <span className="w-36 shrink-0 tnum text-ink-2">{l.job ? jobLabel(l.job, w) : '–'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{l.name}</span>
                        <span className="block truncate text-[11px] text-ink-3">{l.itemTitle || t('workshops.untitled')}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="primary" className="mt-2" disabled={!valid} onClick={download}>
                  <Download size={14} />
                  {t('printPackage.download')}
                </Button>
              </section>
            )}
            {(jobs.length > 0 || (asking && lines.some((l) => l.kind === 'sheet'))) && (
              <section>
                <SectionLabel>{t('printPackage.sheets')}</SectionLabel>
                <p className="mb-1.5 text-[12px] text-ink-3">{t('printPackage.sheetsHint')}</p>
                {!valid && <p className="text-[13px] text-ink-2">{t('printPackage.needParticipants')}</p>}
                <ul className="divide-y divide-line text-[13px]">
                  {jobs.map((j) => (
                    <li key={j.key} className="flex items-center gap-3 py-1.5">
                      <span className="w-36 shrink-0 tnum text-ink-2">{jobLabel(j.job, w)}</span>
                      <span className="min-w-0 flex-1">
                        {j.lines.map((l) => (
                          <span key={`${l.itemId}:${l.id}`} className="block truncate">
                            {l.name} <span className="text-[11px] text-ink-3">· {l.itemTitle || t('workshops.untitled')}</span>
                          </span>
                        ))}
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => printJob(j.key)}>
                        <Printer size={14} />
                        {t('printPackage.print')}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
