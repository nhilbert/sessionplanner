import { crc32, deflateRawSync } from 'node:zlib'

/**
 * A ZIP writer for the exports (server/exports.ts) that streams: one entry is in memory at a time, never the archive.
 * Text parts are deflated, files are stored as they are (most are compressed already). Past 4 GiB or 65 535 entries
 * the archive carries the ZIP64 records for the offsets and counts that no longer fit; single entries stay smaller,
 * as uploads are capped far below that.
 */

export interface ZipPart {
  path: string
  data: Uint8Array | string
  /** Whether to deflate it; for text parts. */
  compress?: boolean
}

const MAX32 = 0xffffffff
const MAX16 = 0xffff
// A fixed timestamp (1 January 2026, 00:00), as in the PPTX writer: the date of the export is in its name and manifest.
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

interface Written {
  name: Uint8Array
  crc: number
  method: number
  packed: number
  size: number
  offset: number
}

function localHeader(name: Uint8Array, crc: number, method: number, packed: number, size: number): Uint8Array {
  const v = new DataView(new ArrayBuffer(30))
  v.setUint32(0, 0x04034b50, true)
  v.setUint16(4, 20, true)
  v.setUint16(6, 0x0800, true) // UTF-8 names
  v.setUint16(8, method, true)
  v.setUint16(10, DOS_TIME, true)
  v.setUint16(12, DOS_DATE, true)
  v.setUint32(14, crc, true)
  v.setUint32(18, packed, true)
  v.setUint32(22, size, true)
  v.setUint16(26, name.length, true)
  return concat([new Uint8Array(v.buffer), name])
}

function directoryEntry(w: Written, zip64: boolean): Uint8Array {
  // Only the offset can outgrow 32 bits here; with zip64 it moves into the extra field.
  const extra = zip64 ? new DataView(new ArrayBuffer(12)) : null
  if (extra) {
    extra.setUint16(0, 0x0001, true)
    extra.setUint16(2, 8, true)
    extra.setBigUint64(4, BigInt(w.offset), true)
  }
  const v = new DataView(new ArrayBuffer(46))
  v.setUint32(0, 0x02014b50, true)
  v.setUint16(4, zip64 ? 45 : 20, true)
  v.setUint16(6, zip64 ? 45 : 20, true)
  v.setUint16(8, 0x0800, true)
  v.setUint16(10, w.method, true)
  v.setUint16(12, DOS_TIME, true)
  v.setUint16(14, DOS_DATE, true)
  v.setUint32(16, w.crc, true)
  v.setUint32(20, w.packed, true)
  v.setUint32(24, w.size, true)
  v.setUint16(28, w.name.length, true)
  v.setUint16(30, extra ? extra.byteLength : 0, true)
  v.setUint32(42, zip64 ? MAX32 : w.offset, true)
  return concat([new Uint8Array(v.buffer), w.name, ...(extra ? [new Uint8Array(extra.buffer)] : [])])
}

function end(count: number, dirSize: number, dirOffset: number, zip64: boolean): Uint8Array {
  const parts: Uint8Array[] = []
  if (zip64) {
    const record = new DataView(new ArrayBuffer(56))
    record.setUint32(0, 0x06064b50, true)
    record.setBigUint64(4, 44n, true)
    record.setUint16(12, 45, true)
    record.setUint16(14, 45, true)
    record.setBigUint64(24, BigInt(count), true)
    record.setBigUint64(32, BigInt(count), true)
    record.setBigUint64(40, BigInt(dirSize), true)
    record.setBigUint64(48, BigInt(dirOffset), true)
    const locator = new DataView(new ArrayBuffer(20))
    locator.setUint32(0, 0x07064b50, true)
    locator.setBigUint64(8, BigInt(dirOffset + dirSize), true)
    locator.setUint32(16, 1, true)
    parts.push(new Uint8Array(record.buffer), new Uint8Array(locator.buffer))
  }
  const v = new DataView(new ArrayBuffer(22))
  v.setUint32(0, 0x06054b50, true)
  v.setUint16(8, zip64 ? MAX16 : count, true)
  v.setUint16(10, zip64 ? MAX16 : count, true)
  v.setUint32(12, zip64 ? MAX32 : dirSize, true)
  v.setUint32(16, zip64 ? MAX32 : dirOffset, true)
  parts.push(new Uint8Array(v.buffer))
  return concat(parts)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/**
 * The archive of the parts, as they come. `zip64Over` is the size from which offsets count as too large for 32 bits
 * (tests lower it). The stream is pulled: a slow download does not make the server read ahead.
 */
export function zipStream(parts: AsyncIterable<ZipPart>, { zip64Over = MAX32 }: { zip64Over?: number } = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const written: Written[] = []
  let offset = 0
  let iterator: AsyncIterator<ZipPart> | null = null
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      iterator ??= parts[Symbol.asyncIterator]()
      const next = await iterator.next()
      if (next.done) {
        const zip64 = offset >= zip64Over || written.length >= MAX16
        const dir = concat(written.map((w) => directoryEntry(w, zip64)))
        controller.enqueue(concat([dir, end(written.length, dir.length, offset, zip64)]))
        controller.close()
        return
      }
      const part = next.value
      const name = enc.encode(part.path)
      const raw = typeof part.data === 'string' ? enc.encode(part.data) : part.data
      const deflated = part.compress ? deflateRawSync(raw) : null
      const useDeflate = !!deflated && deflated.length < raw.length
      const body = useDeflate ? new Uint8Array(deflated!.buffer, deflated!.byteOffset, deflated!.length) : raw
      const w: Written = { name, crc: crc32(raw), method: useDeflate ? 8 : 0, packed: body.length, size: raw.length, offset }
      written.push(w)
      const header = localHeader(name, w.crc, w.method, w.packed, w.size)
      controller.enqueue(header)
      controller.enqueue(body)
      offset += header.length + body.length
    },
    async cancel() {
      await iterator?.return?.()
    },
  })
}
