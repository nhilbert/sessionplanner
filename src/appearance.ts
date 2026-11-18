/**
 * Light or dark app chrome, per device like the language: "system" follows the operating system
 * (prefers-color-scheme), "light" and "dark" override it. Set as data-appearance on <html>; index.css
 * holds the dark tokens for both ways in. Slides keep their own theme either way.
 */
export type Appearance = 'system' | 'light' | 'dark'

const KEY = 'sp.appearance'
const PAPER = { light: '#faf9f6', dark: '#171716' }

export function initialAppearance(): Appearance {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage blocked */
  }
  return 'system'
}

export function applyAppearance(appearance: Appearance): void {
  const root = document.documentElement
  if (appearance === 'system') delete root.dataset.appearance
  else root.dataset.appearance = appearance
  // The browser's own colours (address bar, scroll bars before the stylesheet) follow the choice too.
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', appearance === 'system' ? 'light dark' : appearance)
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const own = meta.getAttribute('media')?.includes('dark') ? PAPER.dark : PAPER.light
    meta.setAttribute('content', appearance === 'system' ? own : PAPER[appearance])
  })
}

export function changeAppearance(appearance: Appearance): void {
  applyAppearance(appearance)
  try {
    if (appearance === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, appearance)
  } catch {
    /* not remembered */
  }
}
