import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Check, MoreHorizontal } from 'lucide-react'
import { cx, Sheet, SheetRow, useIsPhone } from './ui'

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  /** Shown with a check mark: the current zoom, an option that is on. */
  checked?: boolean
  onSelect: () => void
}

/** A small "⋯" menu: a dropdown beside the button, on phones a bottom sheet; closes on choosing, on Escape and on a click elsewhere. */
export default function Menu({
  items,
  label,
  title,
  className,
  trigger,
}: {
  items: MenuItem[]
  label: string
  /** Heading of the sheet on phones (the group's name, "Print"); the label otherwise. */
  title?: string
  className?: string
  trigger?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const phone = useIsPhone()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // The sheet closes itself (backdrop, Escape); the dropdown closes on a click outside and on Escape.
    if (!open || phone) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', close)
    }
  }, [open, phone])
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const pick = (it: MenuItem) => {
    setOpen(false)
    it.onSelect()
  }
  return (
    <div ref={ref} className={cx('relative', className)} onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onClick={stop}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup={phone ? 'dialog' : 'menu'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="tap inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink pointer-coarse:h-9 pointer-coarse:min-w-9"
      >
        {trigger ?? <MoreHorizontal size={15} />}
      </button>
      {open && phone ? (
        <Sheet open onClose={() => setOpen(false)} label={label} title={title ?? label}>
          {items.map((it) => (
            <SheetRow key={it.label} icon={it.icon} checked={it.checked} danger={it.danger} onClick={() => pick(it)}>
              {it.label}
            </SheetRow>
          ))}
        </Sheet>
      ) : open ? (
        <div role="menu" className="card absolute right-0 z-40 mt-1 min-w-52 p-1 shadow-[var(--shadow)]">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => pick(it)}
              className={cx('flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-surface-2', it.danger && 'text-rose')}
            >
              {it.icon}
              <span className="flex-1">{it.label}</span>
              {it.checked && <Check size={14} className="shrink-0 text-accent" />}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
