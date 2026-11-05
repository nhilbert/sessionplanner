/**
 * Where the API lies as the browser reaches it: the one place that says so, for the client (src/api.ts) and for the
 * addresses the server writes into its answers (the logos and files of a theme). The routes themselves are server/app.ts.
 */
const API = '/api'

/** The address of something in the API; `path` starts with a slash. */
export const apiUrl = (path: string): string => `${API}${path}`

export const isApiUrl = (url: string): boolean => url.startsWith(`${API}/`)

/** The address of a theme's folder, or of a file in it (`theme.css`, a logo, a font). */
export const themeUrl = (id: string, file = ''): string => apiUrl(`/themes/${encodeURIComponent(id)}/${file}`)
