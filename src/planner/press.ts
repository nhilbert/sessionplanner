// Whether a pointer is pressed right now, known before anything on the page reacts to the press.
let pressed = false
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => void (pressed = true), true)
  for (const end of ['pointerup', 'pointercancel']) window.addEventListener(end, () => void (pressed = false), true)
}

/**
 * Runs what takes a line away once the press that led to it is over. A field is left when the pointer goes down
 * elsewhere; were its line taken away at once, what lies below would move up under the pointer and the click would
 * land on nothing. Left with the keyboard, there is nothing to wait for.
 */
export function afterPress(run: () => void): void {
  if (!pressed) return run()
  const done = () => {
    window.removeEventListener('pointerup', done, true)
    window.removeEventListener('pointercancel', done, true)
    // after the click that follows the release
    setTimeout(run, 0)
  }
  window.addEventListener('pointerup', done, true)
  window.addEventListener('pointercancel', done, true)
}
