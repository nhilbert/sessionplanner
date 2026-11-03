import { describe, expect, it } from 'vitest'
import { cutout, cutoutPng, decodePng, encodePng } from './cutout.ts'

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
  it('reads and writes PNG files the same', () => {
    const img = picture(12, 9, [200, 190, 180], { x: 3, y: 2, size: 4 })
    const back = decodePng(encodePng(img))
    expect(back).toEqual(img)
  })
  it('frees a subject of its flat background, softens the edge and trims to the subject', () => {
    const img = picture(60, 40, [220, 218, 214], { x: 20, y: 10, size: 10 })
    const cut = cutout(img)!
    expect(cut).not.toBeNull()
    // trimmed to the square plus the margin of 8
    expect([cut.width, cut.height]).toEqual([26, 26])
    const alpha = (x: number, y: number) => cut.rgba[(y * cut.width + x) * 4 + 3]
    expect(alpha(0, 0)).toBe(0)
    expect(alpha(13, 13)).toBe(255)
    // the background colour stays under the transparency, so a soft edge keeps its tone
    expect([...cut.rgba.subarray(0, 3)]).toEqual([220, 218, 214])
    expect(decodePng(cutoutPng(encodePng(img))!)).toEqual(cut)
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
