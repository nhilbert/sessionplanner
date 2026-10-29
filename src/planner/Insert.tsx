import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Coffee, Flag, FolderOpen, Plus, Square, StickyNote } from 'lucide-react'
import type { ItemKind } from '@/domain/types'
import { cx } from '@/components/ui'

export type InsertKind = ItemKind | 'group'

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

/**
 * A ⊕ in the gutter left of the cards, at the gap between two entries (docs/concept.md, section 3). It never
 * starts a drag and sits outside the cards, so the lower-edge resize handle and dragging keep working; while
 * something is dragged or resized the planner hides all of them. On touch screens it stays faintly visible.
 */
export function InsertPoint({ onInsert, allowGroup, position }: { onInsert: (kind: InsertKind) => void; allowGroup: boolean; position: 'top' | 'bottom' }) {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  return (
    // Only the ⊕ takes the pointer; the rest lets clicks and the resize handle underneath work as before.
    <div className={cx('pointer-events-none absolute -left-6 z-10 flex h-5 w-full items-center', position === 'top' ? '-top-2.5' : '-bottom-2')}>
      <button
        type="button"
        aria-label={t('insert.here')}
        title={t('insert.here')}
        onPointerDown={stop}
        onMouseDown={stop}
        onTouchStart={stop}
        onClick={(e) => {
          e.stopPropagation()
          const r = e.currentTarget.getBoundingClientRect()
          setMenu({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
        }}
        className={cx(
          'peer pointer-events-auto relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-2 bg-surface text-ink-3 opacity-0 shadow-sm transition-opacity hover:border-accent hover:text-accent hover:opacity-100 group-hover/list:opacity-40 [@media(hover:none)]:opacity-50',
          menu && 'opacity-100',
        )}
      >
        <Plus size={12} strokeWidth={2.5} />
      </button>
      {/* the line shows where the new entry lands */}
      <span className={cx('pointer-events-none ml-1 h-px flex-1 bg-accent/50 opacity-0 transition-opacity peer-hover:opacity-100', menu && 'opacity-100')} />
      {menu &&
        createPortal(
          <Radial
            x={menu.x}
            y={menu.y}
            allowGroup={allowGroup}
            onClose={() => setMenu(null)}
            onPick={(kind) => {
              setMenu(null)
              onInsert(kind)
            }}
          />,
          document.body,
        )}
    </div>
  )
}

/** The kinds on an arc to the right of the ⊕; closes on Escape or a click elsewhere. */
function Radial({ x, y, allowGroup, onPick, onClose }: { x: number; y: number; allowGroup: boolean; onPick: (k: InsertKind) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<InsertKind | null>(null)
  useEffect(() => {
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
    }
  }, [onClose])

  const kinds: { kind: InsertKind; icon: ReactNode; label: string }[] = [
    { kind: 'block', icon: <Square size={15} />, label: t('kinds.block') },
    { kind: 'break', icon: <Coffee size={15} />, label: t('kinds.break') },
    { kind: 'marker', icon: <Flag size={15} />, label: t('kinds.marker') },
    { kind: 'note', icon: <StickyNote size={15} />, label: t('kinds.note') },
    ...(allowGroup ? [{ kind: 'group' as const, icon: <FolderOpen size={15} />, label: t('group.new') }] : []),
  ]
  // Spread over a half circle opening to the right (the ⊕ sits at the left edge of the column).
  const radius = 58
  const span = Math.PI * 0.9
  const placed = kinds.map((k, i) => {
    const a = -span / 2 + (kinds.length === 1 ? span / 2 : (span * i) / (kinds.length - 1))
    return { ...k, dx: Math.cos(a) * radius, dy: Math.sin(a) * radius }
  })
  return (
    <div ref={ref} className="fixed z-50" style={{ left: x, top: y }} role="menu" aria-label={t('insert.here')}>
      <span className="absolute -left-[70px] -top-[70px] h-[140px] w-[140px] rounded-full bg-surface/70 shadow-[var(--shadow)] backdrop-blur-[2px]" />
      {placed.map((k) => (
        <button
          key={k.kind}
          type="button"
          role="menuitem"
          title={k.label}
          aria-label={k.label}
          onMouseEnter={() => setHover(k.kind)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onPick(k.kind)}
          style={{ transform: `translate(${k.dx - 18}px, ${k.dy - 18}px)` }}
          className="fade-in absolute flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-2 shadow-sm transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent"
        >
          {k.icon}
        </button>
      ))}
      <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent p-1 text-accent-ink">
        <Plus size={12} strokeWidth={2.5} />
      </span>
      {hover && (
        <span className="pointer-events-none absolute left-[78px] -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[12px] text-paper" style={{ top: placed.find((p) => p.kind === hover)!.dy }}>
          {placed.find((p) => p.kind === hover)!.label}
        </span>
      )}
    </div>
  )
}
