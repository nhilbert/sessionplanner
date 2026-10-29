import { type ReactNode, useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cx } from './ui'

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  onSelect: () => void
}

/** A small "⋯" menu; closes on choosing, on Escape and on a click elsewhere. */
export default function Menu({ items, label, className, trigger }: { items: MenuItem[]; label: string; className?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open])
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <div ref={ref} className={cx('relative', className)} onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onClick={stop}>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen(!open)}
        className="inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
      >
        {trigger ?? <MoreHorizontal size={15} />}
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-1 min-w-52 p-1 shadow-[var(--shadow)]">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
              className={cx('flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-surface-2', it.danger && 'text-rose')}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
