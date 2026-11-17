import de from '@/i18n/de.json'
import en from '@/i18n/en.json'
import { isSampleWord } from '@/domain/sampleSets'

/**
 * Text that stands on a slide only to be replaced: the words of a starter slide's sample subject, and the
 * placeholder words of a blank layout ("Title", "Point 2"), in either language of the app. The editor selects
 * such a text as a whole when it is edited, so the first key typed replaces it.
 */
const PLACEHOLDERS: Set<string> = (() => {
  const out = new Set<string>()
  for (const words of [de.slides.placeholder, en.slides.placeholder])
    for (const w of Object.values(words)) {
      out.add(w)
      for (let i = 1; i <= 6; i++) out.add(`${w} ${i}`)
    }
  return out
})()

export const isReplaceable = (text: string): boolean => {
  // the fields' markup for bold, italic and accent around the whole text does not make it the author's
  const plain = text.trim().replace(/^(\*\*|\*|==)(.*)\1$/s, '$2').trim()
  return plain !== '' && (PLACEHOLDERS.has(plain) || isSampleWord(plain))
}
