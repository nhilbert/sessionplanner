/**
 * A stage the exports lay slides out on at their design size, out of sight, in the page that shows the deck (so the
 * theme's stylesheet and fonts are loaded): the PowerPoint export reads shapes from it, the PDF export words.
 */
export function createStage(theme: string, css = ''): { root: HTMLElement; remove: () => void } {
  const stage = document.createElement('div')
  stage.className = 'slide-stage'
  stage.setAttribute('aria-hidden', 'true')
  stage.style.cssText = 'position:fixed;left:-30000px;top:0;pointer-events:none;'
  const root = document.createElement('div')
  root.className = 'slide-root'
  root.dataset.theme = theme
  stage.appendChild(root)
  const style = document.createElement('style')
  style.textContent = css
  if (css) document.head.appendChild(style)
  document.body.appendChild(stage)
  return { root, remove: () => (stage.remove(), style.remove()) }
}
