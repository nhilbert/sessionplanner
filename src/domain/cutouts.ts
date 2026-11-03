import { classes, type El, hasClass, isEl, parseTree, serializeNodes } from './slideTree.ts'

/**
 * Cut-outs on slides (docs/slides.md, section 5): where an illustration is shown whole on the slide's ground, its
 * cut-out (server/cutout.ts) takes the original's place, so no rectangle of paper stands on the slide. That is a card
 * picture (a picture card in `.plain` gets `.contain`, since a band cropped from a cut-out would cut the subject), the
 * picture of a split (which gets `.contain`: shown whole instead of bleeding) and a main figure that does not fill
 * the slide. Pictures that bleed (title, section, agenda, break, `.full`, `.picture` cards) keep their original.
 */
export function withCutouts(html: string, cutoutOf: (hash: string) => string | null): string {
  const nodes = parseTree(html)
  let changed = false
  const addClass = (el: El, c: string) => {
    if (hasClass(el, c)) return
    el.attrs.class = [...classes(el), c].join(' ')
    changed = true
  }
  const swap = (img: El): boolean => {
    const m = /^asset:([0-9a-f]{64})$/.exec(img.attrs.src ?? '')
    const cut = m && cutoutOf(m[1])
    if (!cut || cut === m[1]) return false
    img.attrs.src = `asset:${cut}`
    changed = true
    return true
  }
  const visit = (el: El, section: El | null) => {
    if (el.tag === 'section' && hasClass(el, 'slide')) section = el
    const kids = el.children.filter(isEl)
    if (el.tag === 'ul' && hasClass(el, 'cards') && !hasClass(el, 'picture')) {
      let any = false
      for (const li of kids) for (const img of li.children.filter(isEl)) if (img.tag === 'img' && swap(img)) any = true
      if (any && hasClass(el, 'plain')) addClass(el, 'contain')
    } else if (el.tag === 'div' && hasClass(el, 'split')) {
      let any = false
      for (const figure of kids) if (figure.tag === 'figure') for (const img of figure.children.filter(isEl)) if (img.tag === 'img' && swap(img)) any = true
      if (any) addClass(el, 'contain')
    } else if (el.tag === 'figure' && hasClass(el, 'main') && !(section && hasClass(section, 'full'))) {
      for (const img of kids) if (img.tag === 'img') swap(img)
    }
    for (const k of kids) visit(k, section)
  }
  for (const n of nodes) if (isEl(n)) visit(n, null)
  return changed ? serializeNodes(nodes) : html
}
