import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Coffee, Flag, FolderOpen, Plus, Square, StickyNote } from 'lucide-react'
import type { ItemKind } from '@/domain/types'
import { cx, Sheet, SheetRow, useIsPhone } from '@/components/ui'
import { useOverlay } from '@/components/overlay'

export type InsertKind = ItemKind | 'group'

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation()

const kindsOf = (t: TFunction, allowGroup: boolean): { kind: InsertKind; icon: ReactNode; label: string }[] => [
  { kind: 'block', icon: <Square size={15} />, label: t('kinds.block') },
  { kind: 'break', icon: <Coffee size={15} />, label: t('kinds.break') },
  { kind: 'marker', icon: <Flag size={15} />, label: t('kinds.marker') },
  { kind: 'note', icon: <StickyNote size={15} />, label: t('kinds.note') },
  ...(allowGroup ? [{ kind: 'group' as const, icon: <FolderOpen size={15} />, label: t('group.new') }] : []),
]

/**
 * A ⊕ at the gap between two entries (docs/concept.md, section 3). It never starts a drag and sits on the cards'
 * left edge, outside their rows, so the lower-edge resize handle and dragging keep working; while something is
 * dragged or resized the planner hides all of them.
 *
 * With a pointer that hovers ("hover") it shows only beside the entry under the pointer. On touch screens the
 * marks would have to stand there all the time and took a strip of the screen: there they stay away until inserting
 * is switched on ("pick"), and then every gap is one wide target, as high as the lowest row so that two never overlap. On phones the kinds come up as a labelled sheet
 * instead of the radial menu.
 */
export function InsertPoint({ onInsert, allowGroup, position, mode }: { onInsert: (kind: InsertKind) => void; allowGroup: boolean; position: 'top' | 'bottom'; mode: 'hover' | 'pick' }) {
  const { t } = useTranslation()
  const phone = useIsPhone()
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const pick = (kind: InsertKind) => {
    setMenu(null)
    onInsert(kind)
  }
  const open = (e: { stopPropagation: () => void; currentTarget: Element }) => {
    e.stopPropagation()
    const r = (e.currentTarget.querySelector('[data-plus]') ?? e.currentTarget).getBoundingClientRect()
    setMenu({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }
  const plus = 'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink'
  return (
    // Only the ⊕ (or, while picking, the gap) takes the pointer; the rest lets clicks and the resize handle underneath work.
    <div className={cx('pointer-events-none absolute -left-[11px] right-0 z-10 flex items-center', mode === 'pick' ? 'h-8' : 'h-5', position === 'top' ? (mode === 'pick' ? '-top-4' : '-top-2.5') : mode === 'pick' ? '-bottom-4' : '-bottom-2.5')}>
      {mode === 'pick' ? (
        <button type="button" aria-label={t('insert.here')} onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onClick={open} className="pointer-events-auto flex h-full w-full items-center gap-1.5">
          <span data-plus className={plus}>
            <Plus size={13} strokeWidth={2.5} />
          </span>
          <span className="h-0.5 flex-1 rounded-full bg-accent" />
        </button>
      ) : (
        <>
          <button
            type="button"
            aria-label={t('insert.here')}
            title={t('insert.here')}
            onPointerDown={stop}
            onMouseDown={stop}
            onTouchStart={stop}
            onClick={open}
            className={cx(plus, 'tap peer pointer-events-auto relative opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 group-hover/entry:opacity-45', menu && 'opacity-100')}
          >
            <Plus size={13} strokeWidth={2.5} />
          </button>
          {/* the line shows where the new entry lands */}
          <span className={cx('pointer-events-none ml-1 h-0.5 flex-1 rounded-full bg-accent opacity-0 transition-opacity peer-hover:opacity-100', menu && 'opacity-100')} />
        </>
      )}
      {menu && phone ? (
        <Sheet open onClose={() => setMenu(null)} label={t('insert.here')} title={t('insert.here')}>
          {kindsOf(t, allowGroup).map((k) => (
            <SheetRow key={k.kind} icon={k.icon} onClick={() => pick(k.kind)}>
              {k.label}
            </SheetRow>
          ))}
        </Sheet>
      ) : menu ? (
        createPortal(<Radial x={menu.x} y={menu.y} allowGroup={allowGroup} onClose={() => setMenu(null)} onPick={pick} />, document.body)
      ) : null}
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
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [onClose])
  useOverlay(true, onClose)

  const kinds = kindsOf(t, allowGroup)
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
          className="fade-in absolute flex h-9 w-9 items-center justify-center rounded-full border border-line-2 bg-surface text-brand-ink shadow-sm transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-deep"
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
