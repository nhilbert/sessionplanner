import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Minus, Plus } from 'lucide-react'
import type { Item } from '@/domain/types'
import type { ItemFields } from '@/domain/ops'
import { formatDuration, formatTime, parseClock, parseDuration, SNAP } from '@/domain/time'
import { Button, cx, Segmented, Sheet } from '@/components/ui'

export type TimeMode = 'duration' | 'start'

const PRESETS = [10, 15, 20, 30, 45, 60, 90, 120]
const SLIDER_MAX = 240

interface Props {
  item: Item
  mode: TimeMode
  /** Where the clicked time or duration sits on screen (desktop popover). */
  anchor: DOMRect
  /** The item's start as the agenda computes it now (for "follows the agenda" and the quick times). */
  computedStart: number | null
  phone: boolean
  /** Shown on the timeline while editing; null = back to the stored values. */
  onPreview: (fields: Partial<Pick<ItemFields, 'duration' | 'fixedStart'>> | null) => void
  onCommit: (fields: Partial<Pick<ItemFields, 'duration' | 'fixedStart'>>) => void
  onClose: () => void
}

/**
 * Editing a length or a start time (docs/concept.md, section 3): slider, steps of 5 minutes, common values and
 * typing, previewed live on the timeline. Closing (Done, Enter, a click elsewhere) saves as one undo step;
 * Escape discards. A popover beside the card on desktop, a bottom sheet with large targets on phones (a tap on
 * its backdrop saves, like a click elsewhere on desktop).
 */
export default function TimeEditor({ item, mode, anchor, computedStart, phone, onPreview, onCommit, onClose }: Props) {
  const { t } = useTranslation()
  const [duration, setDuration] = useState(item.duration)
  const [fixed, setFixed] = useState(item.fixedStart !== null)
  const [start, setStart] = useState(item.fixedStart ?? computedStart ?? 540)
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  // Closing can be asked for twice (a tap on the sheet's backdrop reaches two listeners): only the first counts.
  const closing = useRef(false)

  const fields = (): Partial<Pick<ItemFields, 'duration' | 'fixedStart'>> => (mode === 'duration' ? { duration } : { fixedStart: fixed ? start : null })
  const changed = () => (mode === 'duration' ? duration !== item.duration : (fixed ? start : null) !== item.fixedStart)
  const done = () => {
    if (closing.current) return
    closing.current = true
    onPreview(null)
    if (changed()) onCommit(fields())
    onClose()
  }
  /** Enter in the typed field: take that value and close in one go. */
  const submit = (v: number) => {
    if (closing.current) return
    closing.current = true
    const f = mode === 'duration' ? { duration: v } : { fixedStart: v }
    onPreview(null)
    if (mode === 'duration' ? v !== item.duration : v !== item.fixedStart) onCommit(f)
    onClose()
  }
  const cancel = () => {
    if (closing.current) return
    closing.current = true
    onPreview(null)
    onClose()
  }
  // Keep the latest handlers for the outside-click and key listeners.
  const handlers = useRef({ done, cancel })
  handlers.current = { done, cancel }

  useEffect(() => {
    onPreview(changed() ? fields() : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, fixed, start])

  useEffect(() => {
    // Desktop: a press anywhere outside the popover saves and closes. On phones the sheet's backdrop does that on
    // the tap's click, so the card underneath never receives the tap.
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) handlers.current.done()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        handlers.current.cancel()
      }
    }
    if (!phone) window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [phone])

  // Desktop: below the clicked value, or above it when there is no room; always inside the window.
  useLayoutEffect(() => {
    if (phone || !box.current) return
    const { offsetWidth: w, offsetHeight: h } = box.current
    const below = anchor.bottom + 6
    const top = below + h > window.innerHeight - 8 ? Math.max(8, anchor.top - h - 6) : below
    const left = Math.min(Math.max(8, anchor.left - 16), window.innerWidth - w - 8)
    setPos({ top, left })
  }, [anchor, phone, mode, fixed])

  const step = (delta: number) => {
    if (mode === 'duration') setDuration((d) => Math.min(1440, Math.max(SNAP, d + delta)))
    else {
      setFixed(true)
      setStart((s) => Math.min(1435, Math.max(0, s + delta)))
    }
  }
  const label = mode === 'duration' ? t('item.duration') : t('item.fixedStart')
  const quarters = (() => {
    const base = computedStart ?? start
    const next = Math.ceil((base + 1) / 15) * 15
    return [next, next + 15, next + 30, next + 45].filter((m) => m < 1440)
  })()

  const body = (
    <div
      ref={box}
      role={phone ? undefined : 'dialog'}
      aria-label={phone ? undefined : label}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          done()
        } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (e.target as HTMLElement).tagName !== 'INPUT') {
          e.preventDefault()
          step(e.key === 'ArrowUp' ? SNAP : -SNAP)
        }
      }}
      style={phone ? undefined : { top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={cx('space-y-3', phone ? 'pb-1' : 'card fixed z-50 w-[320px] p-4 shadow-[var(--shadow)]')}
    >
      <div className="truncate text-[13px] font-medium text-ink-2">{item.title || t(`kinds.${item.kind}`)}</div>

      {mode === 'start' && (
        <Segmented
          size={phone ? 'md' : 'sm'}
          value={fixed ? 'fixed' : 'flow'}
          onChange={(v) => setFixed(v === 'fixed')}
          options={[
            { value: 'flow', label: t('time.flows') },
            { value: 'fixed', label: t('time.fixed') },
          ]}
        />
      )}

      {(mode === 'duration' || fixed) && (
        <div className="flex items-center gap-2">
          <StepButton label="−5" phone={phone} onClick={() => step(-SNAP)}>
            <Minus size={phone ? 18 : 15} />
          </StepButton>
          {mode === 'duration' ? (
            <TypedValue key={duration} value={formatDuration(duration)} edit={String(duration)} parse={parseDuration} onValue={setDuration} onSubmit={submit} phone={phone} label={t('item.duration')} />
          ) : (
            <TypedValue key={start} value={formatTime(start)} edit={formatTime(start)} parse={(v) => parseClock(v) ?? undefined} onValue={setStart} onSubmit={submit} phone={phone} label={t('item.fixedStart')} />
          )}
          <StepButton label="+5" phone={phone} onClick={() => step(SNAP)}>
            <Plus size={phone ? 18 : 15} />
          </StepButton>
        </div>
      )}
      {mode === 'start' && !fixed && computedStart !== null && <p className="text-[13px] text-ink-2">{t('time.flowsHint', { time: formatTime(computedStart) })}</p>}

      {mode === 'duration' && (
        <input
          type="range"
          min={SNAP}
          max={Math.max(SLIDER_MAX, Math.ceil(duration / 60) * 60)}
          step={SNAP}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          aria-label={t('item.duration')}
          className={cx('w-full accent-[var(--accent)]', phone && 'h-8')}
        />
      )}

      <div className="flex flex-wrap gap-1.5">
        {mode === 'duration'
          ? PRESETS.map((m) => (
              <Chip key={m} active={duration === m} phone={phone} onClick={() => setDuration(m)}>
                {formatDuration(m)}
              </Chip>
            ))
          : [...(computedStart !== null && item.fixedStart !== null && computedStart !== start ? [computedStart] : []), ...quarters].map((m) => (
              <Chip
                key={m}
                active={fixed && start === m}
                phone={phone}
                onClick={() => {
                  setFixed(true)
                  setStart(m)
                }}
              >
                {formatTime(m)}
              </Chip>
            ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size={phone ? 'md' : 'sm'} onClick={cancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="primary" size={phone ? 'md' : 'sm'} onClick={done}>
          {t('time.done')}
        </Button>
      </div>
    </div>
  )
  return phone ? (
    <Sheet open onClose={done} label={label}>
      {body}
    </Sheet>
  ) : (
    body
  )
}

function StepButton({ label, phone, onClick, children }: { label: string; phone: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink', phone ? 'h-12 w-12' : 'h-9 w-9')}
    >
      {children}
    </button>
  )
}

function Chip({ active, phone, onClick, children }: { active: boolean; phone: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'tnum rounded-full border px-2.5 transition-colors',
        phone ? 'h-9 text-[14px]' : 'h-7 text-[12px]',
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

/** The value in large type; typing replaces it (any common form), Enter or leaving applies. */
function TypedValue({
  value,
  edit,
  parse,
  onValue,
  onSubmit,
  phone,
  label,
}: {
  value: string
  edit: string
  parse: (v: string) => number | undefined
  onValue: (v: number) => void
  onSubmit: (v: number) => void
  phone: boolean
  label: string
}) {
  const [text, setText] = useState(value)
  const apply = () => {
    const v = parse(text)
    if (v !== undefined) onValue(v)
    else setText(value)
  }
  return (
    <input
      aria-label={label}
      inputMode="text"
      value={text}
      onFocus={(e) => {
        setText(edit)
        requestAnimationFrame(() => e.target.select())
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={apply}
      onKeyDown={(e) => {
        // Enter takes the typed value and closes; something unreadable stays open with the old value.
        if (e.key === 'Enter') {
          e.stopPropagation()
          e.preventDefault()
          const v = parse(text)
          if (v !== undefined) onSubmit(v)
          else setText(value)
        }
      }}
      className={cx('field tnum min-w-0 flex-1 text-center font-medium', phone ? 'h-12 text-[20px]' : 'h-9 text-[16px]')}
    />
  )
}
