import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Coffee, Minus, Plus } from 'lucide-react'
import { seedOf, type DeckSlideRef } from '@/domain/deck'
import { EXTRA, isExtra, liveSchedule, MINUTE, minutesLeft, momentAt, withExtraBreaks, type LiveBreak, type LiveTimes } from '@/domain/live'
import { newId } from '@/domain/ops'
import { itemsIn, sortedDays } from '@/domain/order'
import { clockIn, durationOf, formatTime, parseTime, scheduleDay } from '@/domain/time'
import type { Day, Item, WorkshopState } from '@/domain/types'
import { usePlanner } from '@/store/usePlanner'
import { Button, cx, IconButton, Modal, Sheet, useIsPhone } from '@/components/ui'
import { useDeck } from './useDeck'

/**
 * Setting the next break live from the presenter view (docs/slides.md, Presenting): a chip in the header names it,
 * a tap opens its length and end – set one, the other follows. The plan stays as it is; the server keeps the live
 * times for the presentation (src/domain/live.ts), and the break slide counts down to the end.
 */

/** The clock, a new Date every `ms`. */
export function useNow(ms: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), ms)
    return () => window.clearInterval(timer)
  }, [ms])
  return now
}

/**
 * The deck as presented (presenter view and presentation alike, so their slides and numbers agree): the workshop's
 * deck with a slide for every break put in live (withExtraBreaks).
 */
export function usePresentedDeck(data: WorkshopState | null) {
  const { t } = useTranslation()
  const live = usePlanner((s) => s.liveTimes)
  const { deck, theme, options, pictures } = useDeck(data)
  const presented = useMemo(() => {
    const picture = (id: string) => (options.pictures && pictures.length ? `<figure><img src="asset:${pictures[seedOf(id) % pictures.length]}" alt=""></figure>` : '')
    return withExtraBreaks(deck, live, t('slides.generated.break'), picture)
  }, [deck, live, t, options.pictures, pictures])
  return { deck: presented, theme }
}

/** The length a break put in live starts with; the dialog that opens with it changes it. */
const EXTRA_MINUTES = 15

export interface NextBreak {
  /** For a break put in live, a stand-in with its id and length: it is in no agenda. */
  item: Item
  day: Day
  /** A break put in live ("Break now"), not in the plan. */
  extra: boolean
  /** Whether the deck shows it (its generated slide or slides of its own): a length can then wait for the slide. */
  hasSlide: boolean
  /** Whether the presentation shows it now. */
  shown: boolean
}

/** The break shown now, else the next one after the slide shown: a break put in live when its slide comes first, else the plan's next of the day (in agenda order, slides or not). */
export function nextBreak(data: WorkshopState, deck: DeckSlideRef[], n: number, live: LiveTimes = {}): NextBreak | null {
  const planned = plannedBreak(data, deck, n)
  const extraAt = deck.findIndex((s, i) => i >= n && isExtra(s.itemId))
  if (extraAt === -1) return planned
  const plannedAt = planned ? deck.findIndex((s, i) => i >= n && s.itemId === planned.item.id) : -1
  if (planned && plannedAt !== -1 && plannedAt < extraAt) return planned
  const id = deck[extraAt].itemId!
  const entry = live[id]
  const step = entry?.step ? data.items.find((i) => i.id === entry.step) : undefined
  const day = (step?.dayId && data.days.find((d) => d.id === step.dayId)) || planned?.day || sortedDays(data.days)[0]
  if (!day) return planned
  const item = { id, kind: 'break', title: '', duration: entry?.minutes ?? EXTRA_MINUTES, fixedStart: null } as Item
  return { item, day, extra: true, hasSlide: true, shown: extraAt === n }
}

/** The plan's break shown now, else its next one of the day after the slide shown. */
function plannedBreak(data: WorkshopState, deck: DeckSlideRef[], n: number): NextBreak | null {
  const anchorAt = deck.findIndex((s, i) => i >= n && !!s.itemId && !isExtra(s.itemId))
  if (anchorAt === -1) return null
  const anchor = data.items.find((i) => i.id === deck[anchorAt].itemId)
  const day = anchor?.dayId ? data.days.find((d) => d.id === anchor.dayId) : undefined
  if (!anchor || !day) return null
  const items = itemsIn(data, day.id)
  const item = items.slice(Math.max(0, items.findIndex((i) => i.id === anchor.id))).find((i) => i.kind === 'break')
  if (!item) return null
  return { item, day, extra: false, hasSlide: deck.some((s) => s.itemId === item.id), shown: deck[n]?.itemId === item.id }
}

/** The step the slide shown belongs to, else the nearest one before it: the step a break put in live interrupts. */
function stepAt(deck: DeckSlideRef[], n: number, live: LiveTimes): string | null {
  for (let i = n; i >= 0; i--) {
    const id = deck[i]?.itemId
    if (!id) continue
    if (!isExtra(id)) return id
    // After a break put in live: the step that one interrupts.
    if (live[id]?.step) return live[id].step!
  }
  return null
}

/** Setting a break: its length or its end, or back to the plan. A length waits for the slide when there is one to wait for. */
function useBreakActions(b: NextBreak, entry: LiveBreak | undefined, timeZone: string) {
  const setLive = usePlanner((s) => s.setLive)
  const [failed, setFailed] = useState(false)
  const run = (p: Promise<void>) => {
    setFailed(false)
    p.catch(() => setFailed(true))
  }
  const setMinutes = (minutes: number) => {
    const m = Math.max(1, Math.min(600, Math.round(minutes)))
    // Without a slide nothing will start it: the length counts from now.
    if (!b.hasSlide && entry?.from == null) run(setLive(b.item.id, Date.now() + m * MINUTE, null))
    else run(setLive(b.item.id, null, m))
  }
  const setEnd = (clock: number) => {
    const now = Date.now()
    run(setLive(b.item.id, momentAt(now, clockIn(new Date(now), timeZone).minutes, clock), null))
  }
  const reset = () => run(setLive(b.item.id, null, null))
  return { setMinutes, setEnd, reset, failed }
}

/** What the break comes to now: its length and from when it counts, its end as a clock time. */
function breakNow(b: NextBreak, entry: LiveBreak | undefined, now: number, timeZone: string) {
  const clock = (ms: number) => clockIn(new Date(ms), timeZone).minutes
  const nowMin = clock(now)
  if (entry?.until != null) {
    if (entry.from != null) return { minutes: Math.round((entry.until - entry.from) / MINUTE), from: 'start' as const, end: clock(entry.until) }
    return { minutes: Math.max(0, minutesLeft(entry.until, now)), from: 'now' as const, end: clock(entry.until) }
  }
  const minutes = entry?.minutes ?? durationOf(b.item)
  return { minutes, from: b.hasSlide && !b.shown ? ('showing' as const) : ('now' as const), end: nowMin + minutes }
}

/** The chip in the presenter view's header, and the sheet (dialog on a large screen) it opens. */
export function BreakChip({ data, deck, n, canEdit, now }: { data: WorkshopState; deck: DeckSlideRef[]; n: number; canEdit: boolean; now: Date }) {
  const { t } = useTranslation()
  const live = usePlanner((s) => s.liveTimes)
  const setLive = usePlanner((s) => s.setLive)
  const phone = useIsPhone()
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const b = nextBreak(data, deck, n, live)
  const tz = data.workshop.timezone
  // Break now: a break as the next slide. One that has not begun yet moves here instead of a second one.
  const breakNow = () => {
    const slide = deck[n]
    if (!slide) return
    const waiting = Object.entries(live).find(([id, e]) => isExtra(id) && e.from === null)
    const id = waiting?.[0] ?? `${EXTRA}${newId()}`
    const entry = waiting?.[1]
    setFailed(false)
    setLive(id, entry?.until ?? null, entry?.until != null ? null : (entry?.minutes ?? EXTRA_MINUTES), { after: slide.key, step: stepAt(deck, n, live) }).then(
      () => setOpen(true),
      () => setFailed(true),
    )
  }
  const nowButton = canEdit && deck[n] && !(b?.extra && !b.shown && deck[n + 1]?.itemId === b.item.id) && (
    <button type="button" onClick={breakNow} title={t('slides.breakNowHint')} aria-label={t('slides.breakNow')} className={cx('tap inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-line-2 px-2.5 text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink pointer-coarse:h-8', failed && 'border-rose text-rose')}>
      <Plus size={13} className="shrink-0" />
      <span className="max-md:hidden">{t('slides.breakNow')}</span>
      <Coffee size={13} className="shrink-0 md:hidden" />
    </button>
  )
  if (!b) return nowButton || null
  const entry = live[b.item.id]
  const label = chipLabel(t, data, b, entry, live, now.getTime(), tz)
  const set = !!entry
  const editor = <BreakEditor b={b} entry={entry} now={now} timeZone={tz} items={itemsIn(data, b.day.id)} onClose={() => setOpen(false)} />
  return (
    <>
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => setOpen(true)}
        title={t('slides.breakSet')}
        className={cx(
          'tap inline-flex h-7 max-w-[55%] shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold tnum transition-colors disabled:cursor-default pointer-coarse:h-8',
          set ? 'bg-accent-soft text-accent-strong' : 'bg-surface-2 text-ink-2 enabled:hover:text-ink',
        )}
      >
        <Coffee size={13} className="shrink-0" />
        <span className="truncate">{label}</span>
      </button>
      {nowButton}
      {phone ? (
        <Sheet open={open} onClose={() => setOpen(false)} label={t('slides.breakSet')}>
          {editor}
        </Sheet>
      ) : (
        <Modal open={open} onClose={() => setOpen(false)} width="max-w-md">
          {editor}
        </Modal>
      )}
    </>
  )
}

function chipLabel(t: TFunction, data: WorkshopState, b: NextBreak, entry: LiveBreak | undefined, live: LiveTimes, now: number, tz: string): string {
  if (entry?.until != null) {
    // A start is only ever set once the break began; the clock, a few seconds behind, reads the start.
    if (entry.from != null) {
      const left = minutesLeft(entry.until, Math.max(now, entry.from))
      return left > 0 ? t('slides.breakChipLeft', { count: left }) : t('slides.breakChipOver')
    }
    return t('slides.breakChipUntil', { time: formatTime(clockIn(new Date(entry.until), tz).minutes) })
  }
  if (entry?.minutes != null) return t('slides.breakChipPending', { count: entry.minutes })
  const slot = liveSchedule(b.day, itemsIn(data, b.day.id), live, tz).slots[b.item.id]
  return slot ? t('slides.breakChip', { time: formatTime(slot.start) }) : t('slides.generated.break')
}

function BreakEditor({ b, entry, now, timeZone, items, onClose }: { b: NextBreak; entry: LiveBreak | undefined; now: Date; timeZone: string; items: Item[]; onClose: () => void }) {
  const { t } = useTranslation()
  const { setMinutes, setEnd, reset, failed } = useBreakActions(b, entry, timeZone)
  const ms = now.getTime()
  const state = breakNow(b, entry, ms, timeZone)
  const planned = scheduleDay(b.day.startMin, b.day.endMin, items).slots[b.item.id]
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null)
  const [endDraft, setEndDraft] = useState<string | null>(null)
  const clock = (at: number) => formatTime(clockIn(new Date(at), timeZone).minutes)

  const status =
    entry?.until != null
      ? entry.from != null
        ? t('slides.breakRunning', { time: clock(entry.from), end: clock(entry.until) })
        : t('slides.breakUntil', { time: clock(entry.until) })
      : entry?.minutes != null
        ? t('slides.breakPending')
        : t('slides.breakAsPlanned')
  const commitMinutes = () => {
    if (minutesDraft === null) return
    const v = parseInt(minutesDraft, 10)
    setMinutesDraft(null)
    if (v > 0 && v !== state.minutes) setMinutes(v)
  }
  const commitEnd = () => {
    if (endDraft === null) return
    const v = parseTime(endDraft)
    setEndDraft(null)
    if (v !== null && v !== state.end) setEnd(v)
  }
  // ± on the end goes to full five minutes: agreed ends are round.
  const step = (dir: 1 | -1) => setEnd(dir > 0 ? Math.floor(state.end / 5) * 5 + 5 : Math.ceil(state.end / 5) * 5 - 5)
  const fromLabel = state.from === 'start' ? t('slides.breakFromStart') : state.from === 'showing' ? t('slides.breakFromShowing') : t('slides.breakFromNow')
  const row = 'flex items-center gap-2'

  return (
    <div className="grid gap-4">
      <div>
        <div className="app-title text-[20px] leading-tight">{b.extra ? t('slides.breakNow') : b.item.title || t('slides.generated.break')}</div>
        {planned && <div className="tnum text-[13px] text-ink-2">{t('slides.breakPlanned', { from: formatTime(planned.start), to: formatTime(planned.end) })}</div>}
      </div>
      <p className="text-[14px] text-ink">{status}</p>
      <div className="grid gap-3">
        <div className={row}>
          <label htmlFor="break-minutes" className="w-14 shrink-0 text-[13px] font-semibold text-brand-ink">
            {t('slides.breakDuration')}
          </label>
          <IconButton label={t('slides.breakLess')} onClick={() => setMinutes(state.minutes - 5)} disabled={state.minutes <= 5} className="border border-line-2 text-brand-ink">
            <Minus size={16} />
          </IconButton>
          <input
            id="break-minutes"
            type="number"
            inputMode="numeric"
            min={1}
            max={600}
            value={minutesDraft ?? String(state.minutes)}
            onChange={(e) => setMinutesDraft(e.target.value)}
            onBlur={commitMinutes}
            onKeyDown={(e) => e.key === 'Enter' && commitMinutes()}
            className="field tnum w-[4.5rem] text-center font-bold text-brand-ink"
          />
          <IconButton label={t('slides.breakMore')} onClick={() => setMinutes(state.minutes + 5)} className="border border-line-2 text-brand-ink">
            <Plus size={16} />
          </IconButton>
          <span className="min-w-0 truncate text-[13px] text-ink-2">
            {t('slides.minutesShort')} {fromLabel}
          </span>
        </div>
        <div className={row}>
          <label htmlFor="break-end" className="w-14 shrink-0 text-[13px] font-semibold text-brand-ink">
            {t('slides.breakEnd')}
          </label>
          <IconButton label={t('slides.breakEarlier')} onClick={() => step(-1)} className="border border-line-2 text-brand-ink">
            <Minus size={16} />
          </IconButton>
          <input
            id="break-end"
            type="time"
            value={endDraft ?? formatTime(((state.end % 1440) + 1440) % 1440)}
            onChange={(e) => setEndDraft(e.target.value)}
            onBlur={commitEnd}
            onKeyDown={(e) => e.key === 'Enter' && commitEnd()}
            className="field tnum w-[7.5rem] text-center font-bold text-brand-ink"
          />
          <IconButton label={t('slides.breakLater')} onClick={() => step(1)} className="border border-line-2 text-brand-ink">
            <Plus size={16} />
          </IconButton>
        </div>
      </div>
      <QuickMinutes current={entry ? state.minutes : null} onPick={setMinutes} />
      {failed && <p className="text-[13px] text-rose">{t('slides.breakFailed')}</p>}
      <p className="text-[12px] text-ink-3">{b.extra ? t('slides.breakNowNote') : t('slides.breakHint')}</p>
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            reset()
            // A break put in live is gone with it: nothing is left to set.
            if (b.extra) onClose()
          }}
          disabled={!entry}
        >
          {b.extra ? t('slides.breakRemove') : t('slides.breakReset')}
        </Button>
        <Button onClick={onClose}>{t('common.close')}</Button>
      </div>
    </div>
  )
}

const QUICK = [10, 15, 20, 30]

function QuickMinutes({ current, onPick, className }: { current: number | null; onPick: (minutes: number) => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <div className={cx('flex flex-wrap items-center gap-1.5', className)}>
      {QUICK.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={current === m}
          onClick={() => onPick(m)}
          className={cx(
            'tap h-8 rounded-full border px-3 text-[13px] font-semibold tnum transition-colors pointer-coarse:h-9',
            current === m ? 'border-brand bg-brand text-white' : 'border-line-2 bg-surface text-ink hover:bg-surface-2',
          )}
        >
          {m} {t('slides.minutesShort')}
        </button>
      ))}
    </div>
  )
}

/** Under the next slide when that is the break: its length in one tap. */
export function BreakQuick({ data, deck, n, now, canEdit }: { data: WorkshopState; deck: DeckSlideRef[]; n: number; now: Date; canEdit: boolean }) {
  const live = usePlanner((s) => s.liveTimes)
  const b = nextBreak(data, deck, n + 1, live)
  const ok = !!b && deck[n + 1]?.itemId === b.item.id
  const entry = b ? live[b.item.id] : undefined
  const tz = data.workshop.timezone
  if (!ok || !b || !canEdit) return null
  return <QuickRow b={b} entry={entry} now={now} timeZone={tz} />
}

function QuickRow({ b, entry, now, timeZone }: { b: NextBreak; entry: LiveBreak | undefined; now: Date; timeZone: string }) {
  const { setMinutes } = useBreakActions(b, entry, timeZone)
  const state = breakNow(b, entry, now.getTime(), timeZone)
  return <QuickMinutes current={entry ? state.minutes : null} onPick={setMinutes} className="mt-2" />
}
