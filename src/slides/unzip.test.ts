import { describe, expect, it } from 'vitest'
import { BadZip, readZip } from './unzip'
import { zip } from './pptx/zip'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | undefined) => new TextDecoder().decode(b)

/** An archive with one entry of any name, stored: the app's writer would not write the names these tests try. */
function raw(name: string, data: Uint8Array): Uint8Array {
  const n = enc(name)
  const out = new Uint8Array(30 + n.length + data.length + 46 + n.length + 22)
  const v = new DataView(out.buffer)
  v.setUint32(0, 0x04034b50, true)
  v.setUint32(18, data.length, true)
  v.setUint32(22, data.length, true)
  v.setUint16(26, n.length, true)
  out.set(n, 30)
  out.set(data, 30 + n.length)
  const dir = 30 + n.length + data.length
  v.setUint32(dir, 0x02014b50, true)
  v.setUint32(dir + 20, data.length, true)
  v.setUint32(dir + 24, data.length, true)
  v.setUint16(dir + 28, n.length, true)
  out.set(n, dir + 46)
  const end = dir + 46 + n.length
  v.setUint32(end, 0x06054b50, true)
  v.setUint16(end + 8, 1, true)
  v.setUint16(end + 10, 1, true)
  v.setUint32(end + 12, 46 + n.length, true)
  v.setUint32(end + 16, dir, true)
  return out
}

describe('readZip', () => {
  it('reads back what the app itself writes, stored and deflated', async () => {
    const long = 'Folie '.repeat(5000)
    const files = await readZip(await zip([{ path: 'deck.json', data: enc('{"title":"Ä"}') }, { path: 'a/b.html', data: enc(long), compress: true }]))
    expect([...files.keys()].sort()).toEqual(['a/b.html', 'deck.json'])
    expect(dec(files.get('deck.json'))).toBe('{"title":"Ä"}')
    expect(dec(files.get('a/b.html'))).toBe(long)
  })

  it('leaves out names that would lead out of the archive', async () => {
    for (const name of ['../evil.txt', 'a/../../evil.txt', '/etc/passwd', 'C:/evil.txt', '..\\evil.txt', 'a//b.txt']) {
      expect([...(await readZip(raw(name, enc('x')))).keys()], name).toEqual([])
    }
    expect(dec((await readZip(raw('ok/file.txt', enc('x')))).get('ok/file.txt'))).toBe('x')
  })

  it('refuses what is not an archive, and a damaged one', async () => {
    await expect(readZip(enc('no archive here, but long enough to look for one'))).rejects.toThrow(BadZip)
    const broken = raw('a.txt', enc('x'))
    new DataView(broken.buffer).setUint32(0, 0, true)
    await expect(readZip(broken)).rejects.toThrow(BadZip)
  })

  it('stops an archive that unpacks to far more than it says', async () => {
    const big = await zip([{ path: 'big.bin', data: new Uint8Array(1_000_000), compress: true }])
    expect(big.length).toBeLessThan(10_000)
    await expect(readZip(big, 1000)).rejects.toThrow('too much')
    await expect(readZip(raw('a.bin', new Uint8Array(2000)), 1000)).rejects.toThrow('too much')
  })
})
