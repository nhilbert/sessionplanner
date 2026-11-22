/**
 * The planner while it shows the offline copy (docs/offline.md): it looks and works as always, but nothing in it can
 * be changed. The store refuses changes already (store/usePlanner.ts); this keeps the page from seeming to take them:
 * no typing or pasting into a field, no ticking a box or choosing in a list, no file dropped or picked.
 *
 * Returns what undoes it.
 */
export function blockEditing(): () => void {
  const field = (t: EventTarget | null): t is HTMLElement => t instanceof HTMLElement && (t.isContentEditable || t.matches('input, textarea, select'))
  const toggles = (t: EventTarget | null) => t instanceof HTMLInputElement && ['checkbox', 'radio', 'file', 'range', 'color'].includes(t.type)
  const stop = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }
  const listeners: [string, (e: Event) => void][] = [
    ['beforeinput', (e) => field(e.target) && stop(e)],
    ['paste', (e) => field(e.target) && stop(e)],
    ['cut', (e) => field(e.target) && stop(e)],
    ['drop', stop],
    ['click', (e) => toggles(e.target) && stop(e)],
    // A list (select) opens on the pointer or the keyboard; neither may change it.
    ['mousedown', (e) => e.target instanceof HTMLSelectElement && stop(e)],
    ['keydown', (e) => e.target instanceof HTMLSelectElement && (e as KeyboardEvent).key !== 'Tab' && stop(e)],
    // Arrow keys step a time or a number without an input event before.
    ['keydown', (e) => e.target instanceof HTMLInputElement && ['time', 'date', 'number'].includes(e.target.type) && ['ArrowUp', 'ArrowDown'].includes((e as KeyboardEvent).key) && stop(e)],
  ]
  for (const [type, fn] of listeners) document.addEventListener(type, fn, true)
  return () => {
    for (const [type, fn] of listeners) document.removeEventListener(type, fn, true)
  }
}
