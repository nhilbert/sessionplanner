import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

/** A theme folder's name under data/themes, as the server accepts it in a URL and on a workshop. */
export const THEME_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/

/** The slide themes the server has: the built-in default and every folder in `themesDir` that holds a theme.css, sorted. */
export function listThemes(themesDir: string | undefined): string[] {
  const names: string[] = []
  if (themesDir && existsSync(themesDir)) {
    try {
      for (const entry of readdirSync(themesDir, { withFileTypes: true })) {
        if (entry.isDirectory() && THEME_NAME.test(entry.name) && existsSync(path.join(themesDir, entry.name, 'theme.css'))) names.push(entry.name)
      }
    } catch {
      // unreadable folder: only the built-in theme
    }
  }
  return ['default', ...names.sort()]
}
