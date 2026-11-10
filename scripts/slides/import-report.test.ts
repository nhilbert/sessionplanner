import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { it } from 'vitest'
import { deckFromPptx } from '../../src/slides/pptx/read'
import { readZip } from '../../src/slides/unzip'

/**
 * What the PowerPoint import makes of real decks, in numbers, for judging a change to its rules:
 *
 *     SP_DECKS=private-slide-decks npm run import:report
 *
 * It reads every .pptx of the folder, uploads nothing and writes nothing. The decks are private, so the folder is one
 * of the gitignored ones and what this prints stays in the terminal. Without SP_DECKS it does nothing.
 *
 * The columns say whether the content came across in a usable shape, not whether the layouts resemble the file's:
 *   file     visible slides in the file
 *   made     slides of the deck
 *   most     the most slides made from one slide of the file
 *   again    slides with the title of the slide before them
 *   bare     slides without a title (a statement is its own title)
 *   full     slides with more than 700 characters of text
 *   gone     words of the file (four letters and more) found nowhere in the deck; the first few are named
 *   marked   slides of the file with a warning
 */
const folder = process.env.SP_DECKS

const text = (html: string): string =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|apos|#\d+);/g, ' ')
const wordsOf = (s: string): string[] => s.toLowerCase().match(/\p{L}{4,}/gu) ?? []

/** The words of the visible slides, read apart from the importer: every a:t of a slide part, fields left out. */
async function sourceWords(bytes: Uint8Array): Promise<{ slides: number; words: Set<string> }> {
  const files = await readZip(bytes)
  const words = new Set<string>()
  let slides = 0
  for (const [name, data] of files) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(name)) continue
    const xml = new TextDecoder().decode(data)
    if (/^[^>]*<p:sld\b[^>]*\bshow="(0|false)"/.test(xml.slice(xml.indexOf('<p:sld')))) continue
    slides++
    for (const m of xml.replace(/<a:fld\b.*?<\/a:fld>/gs, '').matchAll(/<a:t>([^<]*)<\/a:t>/g)) for (const w of wordsOf(text(m[1]))) words.add(w)
  }
  return { slides, words }
}

it.skipIf(!folder)('reports what the import makes of the decks in SP_DECKS', async () => {
  const rows: Record<string, string | number>[] = []
  const sum = { file: 0, made: 0, again: 0, bare: 0, full: 0, gone: 0, marked: 0 }
  for (const name of readdirSync(folder!).filter((f) => /\.pptx$/i.test(f)).sort()) {
    const bytes = new Uint8Array(readFileSync(join(folder!, name)))
    const source = await sourceWords(bytes)
    const deck = await deckFromPptx(new File([bytes as BlobPart], name))
    const html = await Promise.all(deck.found.fragments.map((f) => f.text()))
    const per = new Map<number, number>()
    for (const n of deck.from) per.set(n, (per.get(n) ?? 0) + 1)
    const titles = html.map((h) => /<h[12]>(.*?)<\/h[12]>/.exec(h)?.[1] ?? '')
    const there = new Set(html.flatMap((h) => wordsOf(text(h))))
    const gone = [...source.words].filter((w) => !there.has(w))
    const row = {
      file: source.slides,
      made: html.length,
      most: Math.max(...per.values()),
      again: titles.filter((t, i) => t && t === titles[i - 1]).length,
      bare: titles.filter((t, i) => !t && !html[i].startsWith('<section class="slide statement')).length,
      full: html.filter((h) => text(h).length > 700).length,
      gone: gone.length,
      marked: new Set(deck.warnings.map((w) => w.slide)).size,
    }
    for (const k of Object.keys(sum) as (keyof typeof sum)[]) sum[k] += row[k]
    rows.push({ deck: name.slice(0, 28), ...row, 'gone, e.g.': gone.slice(0, 12).join(' ') })
  }
  rows.push({ deck: 'all', ...sum })
  console.table(rows)
}, 600_000)
