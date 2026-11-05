/**
 * Where the app lies as the browser reaches it: the one place that says so, for the client (src/api.ts) and for the
 * addresses the server writes into its answers (the logos and files of a theme). The routes themselves are server/app.ts.
 *
 * An app can live under a base path instead of the root of its host. In the browser there is one app, so `setBasePath`
 * sets it for the page. A server process may hold several, so the server never sets it and hands its own to these functions.
 */
const API = '/api'
let current = ''

/** The browser's base path, before anything is loaded: no slash at the end, '' for the root. */
export function setBasePath(path: string): void {
  current = path
}

/** The address of a page of the app, as a new window needs it (links inside the app go through the router). */
export const pageUrl = (path: string): string => `${current}${path}`

/** The address of something in the API; `path` starts with a slash. */
export const apiUrl = (path: string, base = current): string => `${base}${API}${path}`

export const isApiUrl = (url: string): boolean => url.startsWith(`${current}${API}/`)

/** The address of a theme's folder, or of a file in it (`theme.css`, a logo, a font). */
export const themeUrl = (id: string, file = '', base = current): string => apiUrl(`/themes/${encodeURIComponent(id)}/${file}`, base)
