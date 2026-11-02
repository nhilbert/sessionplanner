import { type RefObject, useEffect, useRef } from 'react'

/**
 * Everything that lies above the page – dialogs, sheets, menus, popovers, the slide editor – registers here while
 * it is open. One listener for all:
 *
 * - Escape goes to the top overlay only, and the page's shortcuts stay quiet while any is open, so a key meant for a
 *   menu never closes the editor below it or changes the agenda behind it.
 * - Focus: an overlay with a `root` takes the focus when it opens (the root itself, or its first field), Tab and
 *   Shift+Tab stay inside the top one, and when it closes the focus goes back to what opened it – the thumbnail, the
 *   button – so a keyboard user carries on where they were.
 */

interface Entry {
  escape: () => void
  root?: RefObject<HTMLElement | null>
}

const stack: Entry[] = []
let installed = false

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** The controls inside an element that Tab reaches, in order (hidden ones left out). */
export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'))
}

function onKey(e: KeyboardEvent) {
  if (!stack.length) return
  const top = stack[stack.length - 1]
  if (e.key === 'Escape') {
    if (e.defaultPrevented) return
    e.preventDefault()
    top.escape()
    return
  }
  if (e.key !== 'Tab') return
  const root = top.root?.current
  if (!root) return
  const list = focusables(root)
  const active = document.activeElement as HTMLElement | null
  if (!list.length) {
    e.preventDefault()
    root.focus({ preventScroll: true })
    return
  }
  const first = list[0]
  const last = list[list.length - 1]
  const inside = !!active && root.contains(active)
  if (!inside) {
    e.preventDefault()
    ;(e.shiftKey ? last : first).focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  } else if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault()
    last.focus()
  }
}

export interface OverlayOptions {
  /** The overlay's panel: focus moves into it, Tab stays in it. Without it only Escape is handled (a dropdown). */
  root?: RefObject<HTMLElement | null>
  /** What takes the focus on opening: the panel itself (keys such as the arrows work at once) or its first control. */
  focus?: 'root' | 'first'
  /** Give the focus back to what had it before (default true). */
  restore?: boolean
}

/**
 * Registers an overlay while `open`; `onEscape` runs when Escape is pressed and this overlay is on top. Returns a
 * function that tells whether it is on top now (for the overlay's own keys, such as paging with the arrows).
 */
export function useOverlay(open: boolean, onEscape: () => void, options: OverlayOptions = {}): () => boolean {
  const handler = useRef(onEscape)
  handler.current = onEscape
  const entry = useRef<Entry | null>(null)
  const opts = useRef(options)
  opts.current = options
  useEffect(() => {
    if (!open) return
    if (!installed) {
      window.addEventListener('keydown', onKey)
      installed = true
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const e: Entry = { escape: () => handler.current(), root: opts.current.root }
    entry.current = e
    stack.push(e)
    // After the overlay has painted: into it, unless something inside already has the focus (an autofocus field).
    const frame = requestAnimationFrame(() => {
      const root = e.root?.current
      if (!root || root.contains(document.activeElement)) return
      const target = opts.current.focus === 'first' ? (focusables(root)[0] ?? root) : root
      if (target === root && !root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(frame)
      const at = stack.indexOf(e)
      if (at !== -1) stack.splice(at, 1)
      if (entry.current === e) entry.current = null
      // Back to what opened it, if it is still there and nothing else took the focus meanwhile.
      if (opts.current.restore !== false && opener?.isConnected) {
        const active = document.activeElement
        if (!active || active === document.body || e.root?.current?.contains(active) || !active.isConnected) opener.focus({ preventScroll: true })
      }
    }
  }, [open])
  return () => !!entry.current && stack[stack.length - 1] === entry.current
}

/** Whether any overlay is open (the page's own shortcuts wait). */
export const overlayOpen = (): boolean => stack.length > 0
