import { crc32, deflateSync, inflateSync } from 'node:zlib'

/**
 * Cut-outs at upload (docs/slides.md, section 6, and docs/slide-design.md): an illustration uploaded with its flat
 * background – the ink-wash series sits on paper grey or white – is freed of it, so it stands on the slide's ground
 * instead of sitting in a foreign rectangle. The border pixels decide: when they agree on one colour, that colour is
 * flooded from the edges with a tolerance, the edge is softened by the pixel's distance to the background colour,
 * and the result is trimmed to its subject. Photographs (no flat border) and pictures that are transparent already
 * are left alone: `cutout` answers null. PNG only, 8 bits per channel, not interlaced; pure Node, no native code.
 */

export interface Decoded {
  width: number
  height: number
  /** Four bytes per pixel, rows top to bottom. */
  rgba: Uint8Array
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** More pixels than this are not worth the time (a 4000 × 4000 illustration is far larger than any slide). */
const MAX_PIXELS = 16_000_000

/** A PNG's pixels as RGBA, or null when it is not one this module reads (16 bit, interlaced, too large, damaged). */
export function decodePng(data: Buffer): Decoded | null {
  if (data.length < 8 || !data.subarray(0, 8).equals(SIGNATURE)) return null
  let pos = 8
  let width = 0
  let height = 0
  let depth = 0
  let type = 0
  let interlace = 0
  let palette: Buffer | null = null
  let trns: Buffer | null = null
  const idat: Buffer[] = []
  while (pos + 8 <= data.length) {
    const len = data.readUInt32BE(pos)
    const kind = data.toString('latin1', pos + 4, pos + 8)
    const body = data.subarray(pos + 8, pos + 8 + len)
    if (body.length < len) return null
    pos += 12 + len
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      depth = body[8]
      type = body[9]
      interlace = body[12]
    } else if (kind === 'PLTE') palette = body
    else if (kind === 'tRNS') trns = body
    else if (kind === 'IDAT') idat.push(body)
    else if (kind === 'IEND') break
  }
  if (!width || !height || depth !== 8 || interlace !== 0 || width * height > MAX_PIXELS) return null
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type]
  if (!channels || (type === 3 && !palette)) return null
  let raw: Buffer
  try {
    raw = inflateSync(Buffer.concat(idat))
  } catch {
    return null
  }
  const stride = width * channels
  if (raw.length < height * (stride + 1)) return null
  const px = new Uint8Array(height * stride)
  let prev = new Uint8Array(stride)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p]
    const line = new Uint8Array(raw.subarray(p + 1, p + 1 + stride))
    p += 1 + stride
    if (filter === 1) for (let i = channels; i < stride; i++) line[i] = (line[i] + line[i - channels]) & 255
    else if (filter === 2) for (let i = 0; i < stride; i++) line[i] = (line[i] + prev[i]) & 255
    else if (filter === 3) for (let i = 0; i < stride; i++) line[i] = (line[i] + (((i >= channels ? line[i - channels] : 0) + prev[i]) >> 1)) & 255
    else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? line[i - channels] : 0
        const b = prev[i]
        const c = i >= channels ? prev[i - channels] : 0
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
      }
    } else if (filter !== 0) return null
    px.set(line, y * stride)
    prev = line
  }
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0, o = 0; i < width * height; i++, o += 4) {
    const s = i * channels
    if (type === 6) rgba.set(px.subarray(s, s + 4), o)
    else if (type === 2) {
      rgba[o] = px[s]
      rgba[o + 1] = px[s + 1]
      rgba[o + 2] = px[s + 2]
      rgba[o + 3] = 255
    } else if (type === 0 || type === 4) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = px[s]
      rgba[o + 3] = type === 4 ? px[s + 1] : 255
    } else {
      const k = px[s]
      rgba[o] = palette![k * 3] ?? 0
      rgba[o + 1] = palette![k * 3 + 1] ?? 0
      rgba[o + 2] = palette![k * 3 + 2] ?? 0
      rgba[o + 3] = trns && k < trns.length ? trns[k] : 255
    }
  }
  return { width, height, rgba }
}

/** An RGBA image as a PNG file (8 bits per channel, no filtering, one IDAT). */
export function encodePng({ width, height, rgba }: Decoded): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const chunk = (kind: string, body: Buffer): Buffer => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(body.length, 0)
    head.write(kind, 4, 'latin1')
    const tail = Buffer.alloc(4)
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0)
    return Buffer.concat([head, body, tail])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))])
}

export interface CutoutOptions {
  /** How far (per channel, 0–255) a pixel may be from the background colour and still count as background. */
  tolerance?: number
  /** The margin kept around the subject when the picture is trimmed, in pixels. */
  margin?: number
}

/**
 * The picture with its flat background made transparent and trimmed to its subject, or null when it has no flat
 * background to speak of: fewer than nine in ten border pixels share one colour (a photograph), the border is
 * transparent already (a cut-out), or the background would be nearly nothing or nearly everything.
 */
export function cutout(image: Decoded, options: CutoutOptions = {}): Decoded | null {
  const tol = options.tolerance ?? 28
  const margin = options.margin ?? 8
  const { width: w, height: h, rgba } = image
  if (w < 4 || h < 4) return null
  // the border: its colour is the median of its pixels; it must agree with itself
  const border: number[] = []
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x)
  for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1)
  let clear = 0
  const ch = [[], [], []] as number[][]
  for (const i of border) {
    if (rgba[i * 4 + 3] < 128) clear++
    for (let k = 0; k < 3; k++) ch[k].push(rgba[i * 4 + k])
  }
  if (clear > border.length / 20) return null
  const bg = ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1])
  const dist = (i: number): number => Math.max(Math.abs(rgba[i * 4] - bg[0]), Math.abs(rgba[i * 4 + 1] - bg[1]), Math.abs(rgba[i * 4 + 2] - bg[2]))
  if (border.filter((i) => dist(i) <= tol).length < border.length * 0.9) return null
  // flood the background from the edges
  const mask = new Uint8Array(w * h)
  const queue = new Int32Array(w * h)
  let head = 0
  let tail = 0
  for (const i of border) {
    if (!mask[i] && dist(i) <= tol) {
      mask[i] = 1
      queue[tail++] = i
    }
  }
  while (head < tail) {
    const i = queue[head++]
    const x = i % w
    const y = (i - x) / w
    const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]
    for (const n of next) {
      if (n >= 0 && !mask[n] && dist(n) <= tol) {
        mask[n] = 1
        queue[tail++] = n
      }
    }
  }
  const share = tail / (w * h)
  if (share < 0.05 || share > 0.98) return null
  // soft edge: a subject pixel beside the background fades by its distance to the background colour
  const out = new Uint8Array(w * h * 4)
  const soft = tol * 2
  let x0 = w
  let x1 = -1
  let y0 = h
  let y1 = -1
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    let a = 0
    if (!mask[i]) {
      const x = i % w
      const y = (i - x) / w
      const near = (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w])
      const d = dist(i)
      a = !near || d >= soft ? rgba[o + 3] : Math.max(0, Math.min(rgba[o + 3], Math.round((255 * (d - tol)) / (soft - tol))))
      if (a) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    out[o] = rgba[o]
    out[o + 1] = rgba[o + 1]
    out[o + 2] = rgba[o + 2]
    out[o + 3] = a
  }
  if (x1 < 0) return null
  // trimmed to the subject with a small margin, so the cut-out scales to its subject, not to its old canvas
  x0 = Math.max(0, x0 - margin)
  y0 = Math.max(0, y0 - margin)
  x1 = Math.min(w - 1, x1 + margin)
  y1 = Math.min(h - 1, y1 + margin)
  const tw = x1 - x0 + 1
  const th = y1 - y0 + 1
  const trimmed = new Uint8Array(tw * th * 4)
  for (let y = 0; y < th; y++) trimmed.set(out.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1 + 1) * 4), y * tw * 4)
  return { width: tw, height: th, rgba: trimmed }
}

/** A PNG file's cut-out as a PNG file, or null (see `cutout`). */
export function cutoutPng(data: Buffer, options?: CutoutOptions): Buffer | null {
  const image = decodePng(data)
  const cut = image && cutout(image, options)
  return cut ? encodePng(cut) : null
}
