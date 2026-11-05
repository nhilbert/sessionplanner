/**
 * A ZIP reader without a dependency: the central directory, stored and deflated entries, inflated with the platform's
 * DecompressionStream (browsers and Node have it). Uploaded archives are not to be trusted: the sizes are capped while
 * unpacking, whatever the headers say, and a name that would lead out of the archive is left out.
 */

/** More than any deck needs: an archive that unpacks to more is refused. */
export const MAX_UNZIPPED = 600 * 1024 * 1024
const MAX_ENTRIES = 20_000
const END_OF_DIRECTORY = 0x06054b50
const DIRECTORY_ENTRY = 0x02014b50
const LOCAL_ENTRY = 0x04034b50

export class BadZip extends Error {}

/** The name as it may be used, or null: no absolute paths, no steps out, no folders. */
function safeName(name: string): string | null {
  const clean = name.replace(/\\/g, '/')
  if (!clean || clean.endsWith('/') || clean.startsWith('/') || /^[a-zA-Z]:/.test(clean)) return null
  return clean.split('/').some((step) => step === '..' || step === '.' || step === '') ? null : clean
}

async function inflate(data: Uint8Array, room: number): Promise<Uint8Array> {
  const reader = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > room) {
      await reader.cancel()
      throw new BadZip('The archive unpacks to too much.')
    }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Every file of an archive by its name. Throws BadZip for what is not one, or holds too much. */
export async function readZip(bytes: Uint8Array, limit = MAX_UNZIPPED): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === END_OF_DIRECTORY) {
      end = i
      break
    }
  }
  if (end < 0) throw new BadZip('Not a ZIP archive.')
  const count = view.getUint16(end + 10, true)
  if (count > MAX_ENTRIES) throw new BadZip('The archive holds too many files.')
  let at = view.getUint32(end + 16, true)
  const files = new Map<string, Uint8Array>()
  const decoder = new TextDecoder()
  let room = limit
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== DIRECTORY_ENTRY) throw new BadZip('The archive is damaged.')
    const method = view.getUint16(at + 10, true)
    const packed = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const offset = view.getUint32(at + 42, true)
    const name = safeName(decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength)))
    at += 46 + nameLength + extraLength + commentLength
    if (!name) continue
    if (offset + 30 > bytes.length || view.getUint32(offset, true) !== LOCAL_ENTRY) throw new BadZip('The archive is damaged.')
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true)
    if (start + packed > bytes.length) throw new BadZip('The archive is damaged.')
    const data = bytes.subarray(start, start + packed)
    if (method !== 0 && method !== 8) throw new BadZip('The archive uses a compression this app does not read.')
    if (method === 0 && packed > room) throw new BadZip('The archive unpacks to too much.')
    const file = method === 0 ? data : await inflate(data, room)
    room -= file.length
    files.set(name, file)
  }
  return files
}
