import { describe, expect, it } from 'vitest'
import { cutout, cutoutPng, darkCutout, darkCutoutPng, decodePng, encodePng } from './cutout.ts'

/** A w × h picture of one colour with a dark square inside, as RGBA. */
function picture(w: number, h: number, bg: [number, number, number], square: { x: number; y: number; size: number } | null, alpha = 255) {
  const rgba = new Uint8Array(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const x = i % w
    const y = (i - x) / w
    const inside = square && x >= square.x && x < square.x + square.size && y >= square.y && y < square.y + square.size
    rgba.set(inside ? [20, 30, 40, 255] : [...bg, alpha], i * 4)
  }
  return { width: w, height: h, rgba }
}

describe('cut-outs', () => {
  it('turns a cut-out over for a dark ground: lightness inverted, hue kept, the paper haze cleared', () => {
    // black ink, a red ink half transparent, and the paper's grain at a faint opacity
    const img = { width: 3, height: 1, rgba: new Uint8Array([20, 30, 40, 255, 180, 60, 60, 200, 0, 0, 0, 40]) }
    const dark = darkCutout(img)
    expect([...dark.rgba.subarray(0, 4)]).toEqual([215, 225, 235, 255])
    // still red: every channel moved by the same amount; the opacity ramps up from the haze
    expect([...dark.rgba.subarray(4, 8)]).toEqual([195, 75, 75, 178])
    expect([...dark.rgba.subarray(8, 12)]).toEqual([0, 0, 0, 0])
    expect(decodePng(darkCutoutPng(encodePng(img))!)).toEqual(dark)
    expect(darkCutoutPng(Buffer.from('not a png'))).toBeNull()
  })
  it('leaves a picture drawn in light ink as it is: turned over it would vanish on the dark ground', () => {
    // white strokes, all of them faint, and one dark speck that does not make it a dark drawing
    const img = { width: 3, height: 1, rgba: new Uint8Array([255, 255, 255, 60, 250, 250, 245, 40, 10, 10, 10, 20]) }
    expect(darkCutout(img)).toEqual(img)
  })
  it('reads and writes PNG files the same', () => {
    const img = picture(12, 9, [200, 190, 180], { x: 3, y: 2, size: 4 })
    const back = decodePng(encodePng(img))
    expect(back).toEqual(img)
  })
  it('frees a subject of its paper, inside enclosed shapes too, and trims to the subject', () => {
    const img = picture(60, 40, [220, 218, 214], { x: 20, y: 10, size: 10 })
    // a ring: the square with paper inside it, enclosed on all sides
    for (let y = 13; y < 17; y++) for (let x = 23; x < 27; x++) img.rgba.set([220, 218, 214, 255], (y * 60 + x) * 4)
    const cut = cutout(img)!
    expect(cut).not.toBeNull()
    // trimmed to the square plus the margin of 8
    expect([cut.width, cut.height]).toEqual([26, 26])
    const at = (x: number, y: number) => cut.rgba.subarray((y * cut.width + x) * 4, (y * cut.width + x) * 4 + 4)
    expect(at(0, 0)[3]).toBe(0)
    expect(at(12, 12)[3]).toBe(0)
    // the ink: nearly solid, and laid over the paper it gives the pixel back
    const [r, g, b, a] = at(9, 9)
    expect(a).toBeGreaterThan(220)
    const over = (c: number, p: number) => Math.round((c * a + p * (255 - a)) / 255)
    expect([over(r, 220), over(g, 218), over(b, 214)].map((v, k) => Math.abs(v - [20, 30, 40][k]) <= 3)).toEqual([true, true, true])
    // the paper's colour stays under the transparency, so a scaled edge keeps its tone
    expect([...cut.rgba.subarray(0, 3)]).toEqual([220, 218, 214])
    expect(decodePng(cutoutPng(encodePng(img))!)).toEqual(cut)
  })
  it('keeps a wash a wash: a pale pixel becomes a faint one', () => {
    const img = picture(40, 40, [220, 218, 214], { x: 10, y: 10, size: 10 })
    for (let y = 25; y < 30; y++) for (let x = 25; x < 30; x++) img.rgba.set([170, 190, 190, 255], (y * 40 + x) * 4)
    const cut = cutout(img, { margin: 0 })!
    const alpha = cut.rgba[((17 * cut.width) + 17) * 4 + 3]
    expect(alpha).toBeGreaterThan(20)
    expect(alpha).toBeLessThan(80)
  })
  it('leaves alone what has no flat background, is transparent already, or would be nothing but background', () => {
    // a photograph: the border varies
    const noisy = picture(40, 40, [100, 100, 100], { x: 10, y: 10, size: 10 })
    for (let i = 0; i < noisy.rgba.length; i += 4) noisy.rgba[i] = (i * 7919) % 256
    expect(cutout(noisy)).toBeNull()
    expect(cutout(picture(40, 40, [220, 218, 214], { x: 10, y: 10, size: 10 }, 0))).toBeNull()
    expect(cutout(picture(40, 40, [220, 218, 214], null))).toBeNull()
    expect(cutout(picture(40, 40, [220, 218, 214], { x: 0, y: 0, size: 40 }))).toBeNull()
    expect(cutoutPng(Buffer.from('not a png'))).toBeNull()
  })
})
