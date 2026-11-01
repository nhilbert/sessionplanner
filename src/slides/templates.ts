import type { TFunction } from 'i18next'
import { esc } from '@/domain/slides'
import { type BlankWords, blankDoc, serializeSlide } from '@/domain/slideDoc'

/** The placeholder words of a blank slide, in the UI's language. */
export const blankWords = (t: TFunction): BlankWords => ({
  title: t('slides.placeholder.title'),
  text: t('slides.placeholder.text'),
  point: t('slides.placeholder.point'),
  lead: t('slides.placeholder.lead'),
  step: t('slides.placeholder.step'),
  quote: t('slides.placeholder.quote'),
  cite: t('slides.placeholder.cite'),
  eyebrow: t('slides.placeholder.eyebrow'),
  letter: t('slides.placeholder.letter'),
  term: t('slides.placeholder.term'),
  value: t('slides.placeholder.value'),
  when: t('slides.placeholder.when'),
  axis: t('slides.placeholder.axis'),
  caption: t('slides.placeholder.caption'),
})

/** A blank slide of a layout (docs/slides.md): its structure with placeholder words. */
export const blankSlide = (layout: string, t: TFunction): string => serializeSlide(blankDoc(layout, blankWords(t)))

/** A slide that shows one uploaded picture. */
export const pictureSlide = (hash: string, title: string): string => `<section class="slide figure">${title ? `<header><h2>${esc(title)}</h2></header>` : ''}<figure class="main"><img src="asset:${hash}" alt=""></figure></section>`
