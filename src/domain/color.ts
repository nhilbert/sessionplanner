/**
 * Colour arithmetic for themes (theme.ts) and the theme editor: hex in and out, mixing in OKLab (so a tint of the
 * text colour on the background looks even), and the contrast ratio of WCAG 2.x (SC 1.4.3: 4.5:1 for text,
 * 3:1 for large text; the ratio is (L1 + 0.05) / (L2 + 0.05) over the relative luminances).
 */

export type RGB = [number, number, number]

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** #rgb, #rrggbb (and with alpha, which is dropped) to 0–255 channels; null when it is not a colour. */
export function parseHex(value: string): RGB | null {
  const m = HEX.exec(value.trim())
  if (!m) return null
  let h = m[1]
  if (h.length <= 4) h = [...h].map((c) => c + c).join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

export const isHex = (value: string): boolean => parseHex(value) !== null

export function toHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

const toLinear = (c: number): number => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number): number => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

/** Relative luminance as WCAG defines it. */
export function luminance(rgb: RGB): number {
  const [r, g, b] = rgb.map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The contrast ratio of two colours, 1 to 21. */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export const contrastHex = (a: string, b: string): number | null => {
  const x = parseHex(a)
  const y = parseHex(b)
  return x && y ? contrast(x, y) : null
}

// OKLab (Björn Ottosson, 2020): a perceptual space in which mixing two colours gives even steps.
type Lab = [number, number, number]

function toOklab([r, g, b]: RGB): Lab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

function fromOklab([L, a, b]: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]
}

/** `t` of colour b over colour a, mixed in OKLab (t = 0 gives a, t = 1 gives b). */
export function mix(a: RGB, b: RGB, t: number): RGB {
  const x = toOklab(a)
  const y = toOklab(b)
  return fromOklab([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

export function mixHex(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  if (!x || !y) return a
  return toHex(mix(x, y, t))
}

/** Whether a colour reads as dark (the text on it should be light). */
export const isDark = (hex: string): boolean => {
  const rgb = parseHex(hex)
  return !!rgb && luminance(rgb) < 0.4
}
