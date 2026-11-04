import type { AssetScope } from '@/api'
import type { DeckSlideRef } from '@/domain/deck'
import { hostHtml } from '../SlideView'
import { writePptx, type PptxSlide } from './ooxml'
import { MediaStore, createStage, measureSlide, themeColors, themeFonts } from './measure'

/**
 * The deck as an editable PowerPoint file (docs/slides.md, section 5): every slide laid out by the browser with the
 * real stylesheet and the workshop's theme, then read back as native text boxes, shapes and pictures. Runs in the
 * page that shows the deck, so the theme's stylesheet and fonts are loaded already.
 */
export async function exportDeckPptx(
  deck: DeckSlideRef[],
  options: { title: string; theme: string; scope: AssetScope; chrome: string; lang: string; part?: (p: { n: number; of: number }) => string; onProgress?: (done: number, of: number) => void },
): Promise<Blob> {
  const stage = createStage(options.theme)
  const media = new MediaStore()
  const slides: PptxSlide[] = []
  let colors: ReturnType<typeof themeColors> | null = null
  let fonts: ReturnType<typeof themeFonts> | null = null
  try {
    for (const [i, slide] of deck.entries()) {
      const html = hostHtml(slide.html, options.scope, { label: options.chrome, n: i + 1, part: slide.part && options.part ? options.part(slide.part) : undefined })
      slides.push(await measureSlide(stage.root, html, media))
      const el = stage.root.querySelector<HTMLElement>(':scope > section.slide')
      if (el && !colors) {
        colors = themeColors(el)
        fonts = themeFonts(el)
      }
      options.onProgress?.(i + 1, deck.length)
    }
  } finally {
    stage.remove()
  }
  const lang = options.lang.includes('-') ? options.lang : options.lang === 'de' ? 'de-DE' : options.lang === 'en' ? 'en-US' : options.lang
  const bytes = await writePptx({
    title: options.title,
    lang,
    theme: { name: options.theme, colors: colors ?? { dk1: '22272E', lt1: 'FFFFFF', dk2: '22272E', lt2: 'ECECEA', accents: [] }, fonts: fonts ?? { major: 'Arial', minor: 'Arial' } },
    slides,
    media: media.media,
  })
  return new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
}
