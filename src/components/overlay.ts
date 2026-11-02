import { useEffect, useRef } from 'react'

/**
 * Everything that lies above the page – dialogs, sheets, menus, popovers, the slide editor – registers here while
 * it is open. Escape goes to the top one only, and the planner's shortcuts stay quiet while any is open, so a key
 * meant for a menu never closes the editor below it or changes the agenda behind it. One listener for all.
 */

interface Entry {
  escape: () => void
}

const stack: Entry[] = []
let installed = false

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !stack.length || e.defaultPrevented) return
  e.preventDefault()
  stack[stack.length - 1].escape()
}

/**
 * Registers an overlay while `open`; `onEscape` runs when Escape is pressed and this overlay is on top. Returns a
 * function that tells whether it is on top now (for the overlay's own keys, such as paging with the arrows).
 */
export function useOverlay(open: boolean, onEscape: () => void): () => boolean {
  const handler = useRef(onEscape)
  handler.current = onEscape
  const entry = useRef<Entry | null>(null)
  useEffect(() => {
    if (!open) return
    if (!installed) {
      window.addEventListener('keydown', onKey)
      installed = true
    }
    const e: Entry = { escape: () => handler.current() }
    entry.current = e
    stack.push(e)
    return () => {
      const at = stack.indexOf(e)
      if (at !== -1) stack.splice(at, 1)
      if (entry.current === e) entry.current = null
    }
  }, [open])
  return () => !!entry.current && stack[stack.length - 1] === entry.current
}

/** Whether any overlay is open (the page's own shortcuts wait). */
export const overlayOpen = (): boolean => stack.length > 0
