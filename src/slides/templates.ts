import { esc } from '@/domain/slides'

/** Blank slides for the layouts worth starting from by hand (docs/slides.md); the words come from the UI's language. */
export type TemplateKey = 'statement' | 'list' | 'cards' | 'exercise' | 'quote'
export const TEMPLATES: TemplateKey[] = ['statement', 'list', 'cards', 'exercise', 'quote']

export interface TemplateWords {
  title: string
  text: string
  point: string
  lead: string
  step: string
  quote: string
  cite: string
  eyebrow: string
}

export function template(key: TemplateKey, w: TemplateWords): string {
  const e = (s: string) => esc(s)
  switch (key) {
    case 'statement':
      return `<section class="slide statement"><div class="text"><div class="eyebrow">${e(w.eyebrow)}</div><p class="big">${e(w.title)}</p><p class="sub">${e(w.text)}</p></div></section>`
    case 'list':
      return `<section class="slide list"><header><h2>${e(w.title)}</h2></header><ul class="list"><li>${e(w.point)} 1</li><li>${e(w.point)} 2</li><li>${e(w.point)} 3</li></ul></section>`
    case 'cards':
      return `<section class="slide cards"><header><h2>${e(w.title)}</h2><p class="lead">${e(w.lead)}</p></header><ul class="cards cols-3"><li><h3>${e(w.point)} 1</h3><p>${e(w.text)}</p></li><li><h3>${e(w.point)} 2</h3><p>${e(w.text)}</p></li><li><h3>${e(w.point)} 3</h3><p>${e(w.text)}</p></li></ul></section>`
    case 'exercise':
      return `<section class="slide exercise"><header><h2><span class="tag">${e(w.eyebrow)}</span> ${e(w.title)}</h2><p class="lead">${e(w.lead)}</p></header><div class="exercise"><ol class="steps"><li>${e(w.step)} 1</li><li>${e(w.step)} 2</li><li>${e(w.step)} 3</li></ol></div></section>`
    case 'quote':
      return `<section class="slide quote"><blockquote><p>${e(w.quote)}</p></blockquote><cite>${e(w.cite)}</cite></section>`
  }
}

/** A slide that shows one uploaded picture. */
export const pictureSlide = (hash: string, title: string): string => `<section class="slide figure">${title ? `<header><h2>${esc(title)}</h2></header>` : ''}<figure class="main"><img src="asset:${hash}" alt=""></figure></section>`
