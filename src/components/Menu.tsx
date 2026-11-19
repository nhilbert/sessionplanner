import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, MoreHorizontal } from 'lucide-react'
import { cx, Sheet, SheetRow, useIsPhone } from './ui'
import { useOverlay } from './overlay'

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  /** Shown with a check mark: the current zoom, an option that is on. */
  checked?: boolean
  /** A line above this item: the start of a new group (output after printing, delete after the rest). */
  separated?: boolean
  /** A short second line: what the choice gives (an editable PowerPoint, a PDF as seen here). */
  hint?: string
  disabled?: boolean
  onSelect: () => void
}

/** A small "⋯" menu: a dropdown beside the button, on phones a bottom sheet; closes on choosing, on Escape and on a click elsewhere. */
export default function Menu({
  items,
  label,
  title,
  header,
  className,
  trigger,
  triggerClassName,
  align = 'right',
  float = false,
  footer,
}: {
  items: MenuItem[]
  label: string
  /** Which edge of the button the dropdown lines up with (a button at the left edge of a panel opens to the right). */
  align?: 'left' | 'right'
  /**
   * The dropdown floats over the page instead of sitting in its panel: for a button in a narrow or scrolling place
   * (a thumbnail in the sidebar), where a dropdown in the flow would be cut off. It stays inside the window.
   */
  float?: boolean
  /** Heading of the sheet on phones (the group's name, "Print"); the label otherwise. */
  title?: string
  /** Above the items, apart from them: what the choices belong to (who is signed in). */
  header?: ReactNode
  className?: string
  trigger?: ReactNode
  /** The trigger's look instead of the small icon button: a labelled button in a header. */
  triggerClassName?: string
  /** Below the items, apart from them: a choice that does not close the menu (an own colour under the categories). */
  footer?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const phone = useIsPhone()
  const ref = useRef<HTMLDivElement>(null)
  // The sheet closes itself (backdrop, Escape); the dropdown closes on Escape (as an overlay) and on a click outside.
  const list = useRef<HTMLDivElement>(null)
  useOverlay(open && !phone, () => setOpen(false), { root: list, focus: 'first' })
  useEffect(() => {
    if (!open || phone) return
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node) && !list.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open, phone])
  // Near the end of a panel the dropdown would open below what is in view.
  useEffect(() => {
    if (open && !phone && !float) list.current?.scrollIntoView({ block: 'nearest' })
  }, [open, phone, float])
  // Floating: below the button and in line with its edge, moved as far as the window asks; above when there is no room
  // below; where it fits on neither side, on the side with more room, as high as that room, scrolling inside.
  const [spot, setSpot] = useState<{ left: number; top: number; maxHeight?: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || phone || !float) return setSpot(null)
    const button = ref.current?.getBoundingClientRect()
    const panel = list.current?.getBoundingClientRect()
    if (!button || !panel) return
    const edge = 8
    const left = Math.max(edge, Math.min(align === 'left' ? button.left : button.right - panel.width, window.innerWidth - panel.width - edge))
    const below = button.bottom + 4
    const roomBelow = window.innerHeight - edge - below
    const roomAbove = button.top - 4 - edge
    if (panel.height <= roomBelow) setSpot({ left, top: below })
    else if (panel.height <= roomAbove) setSpot({ left, top: button.top - panel.height - 4 })
    else if (roomBelow >= roomAbove) setSpot({ left, top: below, maxHeight: roomBelow })
    else setSpot({ left, top: edge, maxHeight: roomAbove })
  }, [open, phone, float, align])
  // The page moving under a floating dropdown would leave it behind.
  useEffect(() => {
    if (!open || phone || !float) return
    const close = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, phone, float])
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()
  /** The floating dropdown hangs on the page; its events still reach this menu, which keeps them from what it sits on. */
  const dropdown = (node: ReactNode) => (float ? createPortal(node, document.body) : node)
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
        className={
          triggerClassName ??
          'tap inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink pointer-coarse:h-9 pointer-coarse:min-w-9'
        }
      >
        {trigger ?? <MoreHorizontal size={15} />}
      </button>
      {open && phone ? (
        <Sheet open onClose={() => setOpen(false)} label={label} title={title ?? label}>
          {header && <div className="mb-1 border-b border-line px-2 pb-2">{header}</div>}
          {items.map((it, i) => (
            <div key={i} className={cx(it.separated && i > 0 && 'mt-1 border-t border-line pt-1')}>
              <SheetRow icon={it.icon} checked={it.checked} danger={it.danger} disabled={it.disabled} onClick={() => pick(it)} className="disabled:opacity-40">
                {it.label}
              </SheetRow>
            </div>
          ))}
          {footer && <div className="mt-1 border-t border-line px-2 pb-1 pt-3">{footer}</div>}
        </Sheet>
      ) : open ? (
        dropdown(
          <div
            ref={list}
            role="menu"
            className={cx('card min-w-52 max-w-80 p-1 shadow-[var(--shadow)]', float ? 'fixed z-50' : 'absolute z-40 mt-1', !float && (align === 'left' ? 'left-0' : 'right-0'))}
            style={float ? { left: spot?.left ?? 0, top: spot?.top ?? 0, visibility: spot ? undefined : 'hidden', ...(spot?.maxHeight ? { maxHeight: spot.maxHeight, overflowY: 'auto', overscrollBehavior: 'contain' } : {}) } : undefined}
            onKeyDown={(e) => {
              // Up and down move through the items, as in any menu.
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
              e.preventDefault()
              const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
              const at = items.indexOf(document.activeElement as HTMLElement)
              items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
            }}
          >
            {header && <div className="mb-1 border-b border-line px-3 py-2">{header}</div>}
            {items.map((it, i) => (
              <div key={i} role="none" className={cx(it.separated && i > 0 && 'mt-1 border-t border-line pt-1')}>
                <button
                  type="button"
                  role="menuitem"
                  disabled={it.disabled}
                  onClick={() => pick(it)}
                  className={cx('flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40', it.danger && 'text-rose')}
                >
                  {it.icon && <span className="flex w-4 shrink-0 justify-center self-start pt-0.5">{it.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{it.label}</span>
                    {it.hint && <span className="block text-[11px] leading-snug text-ink-3">{it.hint}</span>}
                  </span>
                  {it.checked && <Check size={14} className="shrink-0 text-accent-strong" />}
                </button>
              </div>
            ))}
            {footer && <div className="mt-1 border-t border-line px-3 pb-2 pt-2">{footer}</div>}
          </div>,
        )
      ) : null}
    </div>
  )
}
