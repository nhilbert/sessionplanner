/**
 * What a theme brings into an exported file. Its stylesheet is written by whoever may edit themes, and it is fetched
 * here with the rights of whoever exports: without these limits a `url(…)` could name an archive of all data and put
 * it into a file that then gets passed on. So only the theme's own files come in, and only pictures and fonts.
 */

/** The parts of a theme's file address, as the server's route takes them: no `%`, so nothing encoded can slip through. */
const OWN_FILE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/
const MEDIA = /^(?:image\/(?:png|jpeg|webp|gif|svg\+xml)|font\/(?:woff2?|ttf|otf))\s*(?:;|$)/i

/** Whether an answer's type is one a theme may bring into an export. */
export const isThemeMedia = (type: string): boolean => MEDIA.test(type)

/** The full address of a file of the theme at `base`, or null for anything else. Judged after normalising: `..`, `%2e%2e` and backslashes count for where they lead. */
export function themeFileAddress(ref: string, base: string, origin = location.origin): string | null {
  let url: URL
  try {
    url = new URL(ref, new URL(base, origin))
  } catch {
    return null
  }
  if (url.origin !== origin || !url.pathname.startsWith(base)) return null
  return OWN_FILE.test(url.pathname.slice(base.length)) ? url.href : null
}

/** A theme's stylesheet with its own files inlined; every other reference stays as it stands, unfetched. */
export async function inlineThemeFiles(css: string, base: string, load: (url: string) => Promise<string | null>, origin = location.origin): Promise<string> {
  const refs = [...new Set([...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2]))]
  let inlined = css
  for (const ref of refs) {
    const url = themeFileAddress(ref, base, origin)
    const data = url && (await load(url))
    if (data) inlined = inlined.split(`url(${ref})`).join(`url(${data})`).split(`url('${ref}')`).join(`url('${data}')`).split(`url("${ref}")`).join(`url("${data}")`)
  }
  return inlined
}
