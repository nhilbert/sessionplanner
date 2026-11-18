import { createContext, type ReactNode, useContext, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type CollisionDetection, DndContext, type DragEndEvent, type DragMoveEvent, DragOverlay, MouseSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { useTranslation } from 'react-i18next'
import { Check, Copy, FolderInput, Trash2 } from 'lucide-react'
import type { SlideHomes } from '@/domain/slideMove'
import { hasRoom } from '@/domain/slideMove'
import { formatDate } from '@/i18n'
import Menu, { type MenuItem } from '@/components/Menu'
import { cx, Modal } from '@/components/ui'

/**
 * Sorting slides by dragging their thumbnails (docs/slides.md, section 7), the same in a step's strip and in the
 * deck of a workshop: a thumbnail dropped on the left half of another goes before it, on the right half after it,
 * and a line shows where. Nothing moves until the drop. With a mouse only: on touch screens a thumbnail's menu
 * does the same, so scrolling the list never starts a drag.
 */

export type Side = 'before' | 'after'

interface Sorting {
  active: string | null
  target: { id: string; side: Side } | null
}

const SortContext = createContext<Sorting>({ active: null, target: null })

export function SlideSort({ onDrop, overlay, children }: { /** A thumbnail was dropped before or after another. */ onDrop: (id: string, over: string, side: Side) => void; /** The thumbnail that follows the pointer. */ overlay: (id: string) => ReactNode; children: ReactNode }) {
  const [sorting, setSorting] = useState<Sorting>({ active: null, target: null })
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }))
  // The thumbnail under the pointer; in the gap between two, the one the dragged thumbnail covers most.
  const collision: CollisionDetection = (args) => {
    pointer.current = args.pointerCoordinates
    const under = pointerWithin(args)
    return under.length ? under : rectIntersection(args)
  }
  const targetOf = (e: DragMoveEvent | DragEndEvent): Sorting['target'] => {
    if (!e.over || e.over.id === e.active.id) return null
    const rect = e.over.rect
    const dragged = e.active.rect.current.translated
    const x = pointer.current?.x ?? (dragged ? dragged.left + dragged.width / 2 : rect.left)
    return { id: String(e.over.id), side: x < rect.left + rect.width / 2 ? 'before' : 'after' }
  }
  const idle = () => setSorting({ active: null, target: null })
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      // Near the edge of a long list it scrolls, slowly enough to stop at the slide meant: a thumbnail at the edge is a target too.
      autoScroll={{ threshold: { x: 0, y: 0.1 }, acceleration: 3 }}
      onDragStart={(e) => setSorting({ active: String(e.active.id), target: null })}
      onDragMove={(e) => {
        const target = targetOf(e)
        setSorting((s) => (s.target?.id === target?.id && s.target?.side === target?.side ? s : { ...s, target }))
      }}
      onDragEnd={(e) => {
        const target = targetOf(e)
        idle()
        if (target) onDrop(String(e.active.id), target.id, target.side)
      }}
      onDragCancel={idle}
    >
      <SortContext.Provider value={sorting}>{children}</SortContext.Provider>
      {/* On the page itself: a panel that is moved or clipped would take the dragged thumbnail with it. */}
      {createPortal(<DragOverlay dropAnimation={null}>{sorting.active ? <div className="w-[132px] opacity-90 shadow-[var(--shadow)]">{overlay(sorting.active)}</div> : null}</DragOverlay>, document.body)}
    </DndContext>
  )
}

/**
 * One thumbnail of a sorted list. A slide that stays where it is (a generated one, a list nobody may change) is
 * neither dragged nor dropped on. `menu` sits in the corner and shows when the thumbnail is pointed at or has the
 * focus, and always where there is no pointer to hover with.
 */
export function SortSlide({ id, fixed, menu, className, children }: { id: string; fixed?: boolean; menu?: ReactNode; className?: string; children: ReactNode }) {
  const { active, target } = useContext(SortContext)
  const drag = useDraggable({ id, disabled: fixed })
  const drop = useDroppable({ id, disabled: fixed })
  const at = target?.id === id ? target.side : null
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node)
        drop.setNodeRef(node)
      }}
      className={cx('group/slide relative', active === id && 'opacity-40', className)}
      {...(fixed ? {} : drag.listeners)}
    >
      {children}
      {menu && <div className="absolute right-1 top-1 rounded-md bg-surface/90 opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover/slide:opacity-100 pointer-coarse:opacity-100">{menu}</div>}
      {at && <span aria-hidden className={cx('pointer-events-none absolute inset-y-0 z-10 w-[3px] rounded-full bg-accent', at === 'before' ? '-left-[5.5px]' : '-right-[5.5px]')} />}
    </div>
  )
}

/** The "⋯" menu of a thumbnail: what can be done with the slide without opening it. An action left out is not offered. */
export function SlideMenu({ n, onMove, onDuplicate, onRemove }: { n: number; onMove?: () => void; onDuplicate?: () => void; onRemove?: () => void }) {
  const { t } = useTranslation()
  const items: MenuItem[] = [
    // The order of every object's menu: duplicate, move it elsewhere, then (apart) remove.
    ...(onDuplicate ? [{ label: t('slides.duplicateSlide'), icon: <Copy size={15} />, onSelect: onDuplicate }] : []),
    ...(onMove ? [{ label: t('slides.moveTo'), icon: <FolderInput size={15} />, onSelect: onMove }] : []),
    ...(onRemove ? [{ label: t('slides.remove'), icon: <Trash2 size={15} />, danger: true, separated: true, onSelect: onRemove }] : []),
  ]
  if (!items.length) return null
  return <Menu items={items} label={t('slides.menu', { n })} title={t('slides.slide', { n })} float />
}

/**
 * Where a slide moves to: the steps of the workshop that carry slides, by day, the parking lot last. The step it
 * is in is marked, a full one says so; choosing a step puts the slide at its end.
 */
export function MoveSlideDialog({ open, homes, current, onPick, onClose }: { open: boolean; homes: SlideHomes[]; /** The step the slide is in. */ current: string; onPick: (itemId: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const headed = homes.length > 1
  return (
    <Modal open={open} onClose={onClose} width="max-w-md">
      <h2 className="mb-3 text-[15px] font-semibold">{t('slides.moveTitle')}</h2>
      {homes.map((h) => (
        <section key={h.day?.id ?? 'parking'} className="mb-2 last:mb-0">
          {headed && (
            <h3 className="mb-0.5 px-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">
              {h.day ? `${t('print.day', { n: h.n })} · ${formatDate(h.day.date, { weekday: 'short', day: 'numeric', month: 'short' })}` : t('planner.parking')}
            </h3>
          )}
          <ul>
            {h.items.map((item) => {
              const here = item.id === current
              const full = !here && !hasRoom(item)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={here || full}
                    aria-current={here || undefined}
                    onClick={() => onPick(item.id)}
                    className={cx('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] pointer-coarse:py-2.5', here || full ? 'text-ink-3' : 'hover:bg-surface-2')}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.title || t(`kinds.${item.kind}`)}</span>
                    <span className="shrink-0 text-[12px] text-ink-3 tnum">{full ? t('slides.stepFull') : item.slides.length ? t('slides.count', { count: item.slides.length }) : ''}</span>
                    {here && <Check size={14} className="shrink-0 text-ink-3" aria-label={t('slides.moveHere')} />}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </Modal>
  )
}
