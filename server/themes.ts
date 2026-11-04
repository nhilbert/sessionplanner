import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { type Theme, type ThemeInfo, themeLogoUrl } from '../src/domain/theme.ts'

/** A theme folder's name under data/themes, as the server accepts it in a URL and on a workshop. */
export const THEME_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/

/** The theme folders under `themesDir` that hold a theme.css, sorted. */
export function folderThemes(themesDir: string | undefined): string[] {
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
  return names.sort()
}

/** The logo a theme folder keeps beside its theme.css (`logo.svg`, `logo.png`, …), the first found, or null. */
export const FOLDER_LOGOS = ['logo.svg', 'logo.png', 'logo.webp', 'logo.jpg', 'logo.jpeg']
function folderLogo(themesDir: string, name: string): string | null {
  const file = FOLDER_LOGOS.find((f) => existsSync(path.join(themesDir, name, f)))
  return file ? `/api/themes/${name}/${file}` : null
}

/**
 * Every slide theme the server has: the built-in default, the folders in `themesDir` and the themes kept as data
 * (`dataThemes`, from the repo). A data theme with the name of a folder hides the folder. Each carries the address
 * of its logo where it has one, so the printouts of a workshop can show the logo of its theme.
 */
export function listThemes(themesDir: string | undefined, dataThemes: (Pick<Theme, 'id' | 'name' | 'updatedAt'> & Partial<Pick<Theme, 'logo' | 'logoLight'>>)[] = []): ThemeInfo[] {
  const data = new Set(dataThemes.map((t) => t.id))
  return [
    { id: 'default', name: 'default', kind: 'builtin' },
    ...folderThemes(themesDir)
      .filter((n) => n !== 'default' && !data.has(n))
      .map((n): ThemeInfo => ({ id: n, name: n, kind: 'folder', logo: folderLogo(themesDir!, n) })),
    ...dataThemes.filter((t) => t.id !== 'default').map((t): ThemeInfo => ({ id: t.id, name: t.name || t.id, kind: 'data', updatedAt: t.updatedAt, logo: themeLogoUrl({ id: t.id, logo: t.logo ?? null, logoLight: null }, 'logo') })),
  ]
}
