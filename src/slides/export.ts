import { type AssetScope, assetUrl } from '@/api'
import type { DeckSlideRef } from '@/domain/deck'
import { cjkCodePoints } from '@/domain/deck'
import { hostHtml } from './SlideView'
import slidesCss from './slides.css?raw'
import defaultThemeCss from './themes/default.css?raw'
import notoCss from '@fontsource/noto-sans-jp/400.css?raw'

import interCss from '@fontsource-variable/inter?raw'
import manropeCss from '@fontsource-variable/manrope?raw'
import serifCss from '@fontsource-variable/source-serif-4?raw'

const notoFiles = import.meta.glob('/node_modules/@fontsource/noto-sans-jp/files/*-400-normal.woff2', { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>
/** The hosted fonts a data theme may choose (src/domain/theme.ts): their stylesheets and the files of their Latin slices. */
const hostedFiles = import.meta.glob(['/node_modules/@fontsource-variable/inter/files/*-wght-normal.woff2', '/node_modules/@fontsource-variable/manrope/files/*-wght-normal.woff2', '/node_modules/@fontsource-variable/source-serif-4/files/*-wght-normal.woff2'], { query: '?url', import: 'default' }) as Record<string, () => Promise<string>>
const HOSTED: { family: string; css: string }[] = [
  { family: 'Inter Variable', css: interCss },
  { family: 'Manrope Variable', css: manropeCss },
  { family: 'Source Serif 4 Variable', css: serifCss },
]

const toDataUrl = async (url: string): Promise<string | null> => {
  const res = await fetch(url).catch(() => null)
  if (!res?.ok) return null
  const blob = await res.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

/** A theme's stylesheet with its fonts and logos inlined, so the file works without the server. */
async function themeCss(theme: string): Promise<string> {
  if (theme === 'default') return defaultThemeCss
  const base = `/api/themes/${encodeURIComponent(theme)}/`
  const res = await fetch(`${base}theme.css`).catch(() => null)
  if (!res?.ok) return defaultThemeCss
  let css = await res.text()
  // Relative addresses are files beside a folder theme; /api/… addresses are the logos of a data theme.
  const refs = [...new Set([...css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)].map((m) => m[2]).filter((u) => !/^(data:|https?:)/.test(u) && (!u.startsWith('/') || u.startsWith('/api/'))))]
  for (const ref of refs) {
    const data = await toDataUrl(ref.startsWith('/') ? ref : base + ref.replace(/^\.\//, ''))
    if (data) css = css.split(`url(${ref})`).join(`url(${data})`).split(`url('${ref}')`).join(`url('${data}')`).split(`url("${ref}")`).join(`url("${data}")`)
  }
  return css
}

/** The Latin slices of the hosted fonts a theme's stylesheet names, inlined, so the file shows the same type everywhere. */
async function hostedFontFaces(themeStyles: string): Promise<string> {
  const out: string[] = []
  for (const font of HOSTED) {
    if (!themeStyles.includes(`'${font.family}'`)) continue
    for (const block of font.css.split('@font-face').slice(1)) {
      const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1]
      if (!file || !/-latin(-ext)?-/.test(file)) continue
      const loader = Object.entries(hostedFiles).find(([p]) => p.endsWith(`/${file}`))?.[1]
      const url = loader && (await loader().catch(() => null))
      const data = url && (await toDataUrl(url))
      if (data) out.push(`@font-face${block.replace(/url\([^)]+\)/, `url(${data})`).split('}')[0]}}`)
    }
  }
  return out.join('\n')
}

/** The slices of Noto Sans JP the deck's glyphs need, inlined. */
async function notoFontFaces(points: Set<number>): Promise<string> {
  if (!points.size) return ''
  const out: string[] = []
  for (const block of notoCss.split('@font-face').slice(1)) {
    const ranges = /unicode-range:\s*([^;]+);/.exec(block)?.[1]
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1]
    if (!ranges || !file) continue
    const hit = ranges.split(',').some((r) => {
      const m = /U\+([0-9a-f]+)(?:-([0-9a-f]+))?/i.exec(r.trim())
      if (!m) return false
      const lo = parseInt(m[1], 16)
      const hi = m[2] ? parseInt(m[2], 16) : lo
      for (const p of points) if (p >= lo && p <= hi) return true
      return false
    })
    if (!hit) continue
    const loader = Object.entries(notoFiles).find(([p]) => p.endsWith(`/${file}`))?.[1]
    const url = loader && (await loader().catch(() => null))
    const data = url && (await toDataUrl(url))
    if (data) out.push(`@font-face { font-family: 'Noto Sans JP'; font-style: normal; font-weight: 400; src: url(${data}) format('woff2'); unicode-range: ${ranges}; }`)
  }
  return out.join('\n')
}

const STAGE_CSS = `html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
.deck { position: relative; width: 100vw; height: 100vh; }
.deck > section.slide { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(var(--s, 1)); display: none; }
.deck > section.slide.current { display: flex; }
.hint { position: fixed; right: 12px; bottom: 10px; font: 12px/1 system-ui, sans-serif; color: #888; opacity: 0.8; }
@media print { html, body { overflow: visible; height: auto; background: #fff; } .deck { width: auto; height: auto; } .deck > section.slide { position: relative; left: 0; top: 0; transform: none; display: flex; page-break-after: always; } .hint { display: none; } @page { size: 338.667mm 190.5mm; margin: 0; } }`

const SCRIPT = `(function(){var s=document.querySelectorAll('.deck > section.slide'),n=Math.min(Math.max(parseInt(location.hash.slice(1)||'1',10)||1,1),s.length)-1,hint=document.querySelector('.hint');
function fit(){var k=Math.min(innerWidth/1280,innerHeight/720);document.querySelector('.deck').style.setProperty('--s',k)}
function show(i){n=Math.min(Math.max(i,0),s.length-1);for(var j=0;j<s.length;j++)s[j].classList.toggle('current',j===n);history.replaceState(null,'','#'+(n+1));hint.textContent=(n+1)+' / '+s.length}
addEventListener('resize',fit);addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'||e.key==='Enter')show(n+1);else if(e.key==='ArrowLeft'||e.key==='PageUp'||e.key==='Backspace')show(n-1);else if(e.key==='Home')show(0);else if(e.key==='End')show(s.length-1);else if(e.key==='f'&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();else return;e.preventDefault()});
addEventListener('click',function(e){show(e.clientX<innerWidth/3?n-1:n+1)});var x0=null;addEventListener('touchstart',function(e){x0=e.touches[0].clientX});addEventListener('touchend',function(e){if(x0===null)return;var d=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(d)>40)show(d<0?n+1:n-1)});
fit();show(n)})();`

/**
 * One self-contained HTML file of the deck: stylesheet, theme with fonts and logos, the glyph font slices the
 * deck needs, pictures as data, a few lines of script to page through. Opens from a USB stick, prints to 16:9 pages.
 */
export async function exportDeckHtml(deck: DeckSlideRef[], options: { title: string; theme: string; scope: AssetScope; chrome: string; lang: string }): Promise<Blob> {
  const assets = new Map<string, string>()
  const sections: string[] = []
  for (const [i, slide] of deck.entries()) {
    let html = hostHtml(slide.html, options.scope, { label: options.chrome, n: i + 1 })
    for (const m of [...slide.html.matchAll(/asset:([0-9a-f]{16,64})/g)]) {
      const hash = m[1]
      if (!assets.has(hash)) assets.set(hash, (await toDataUrl(assetUrl(options.scope, hash))) ?? '')
      html = html.split(assetUrl(options.scope, hash)).join(assets.get(hash) || '')
    }
    sections.push(html)
  }
  const fonts = await notoFontFaces(cjkCodePoints(sections.join('')))
  const theme = await themeCss(options.theme)
  const css = [slidesCss.replace(/@import[^;]+;/g, ''), theme, await hostedFontFaces(theme), fonts, STAGE_CSS].join('\n')
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const doc = `<!doctype html>
<html lang="${esc(options.lang)}" data-theme="${esc(options.theme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(options.title)}</title>
<style>${css}</style></head>
<body><div class="deck">${sections.join('\n')}</div><div class="hint"></div><script>${SCRIPT}</script></body></html>`
  return new Blob([doc], { type: 'text/html;charset=utf-8' })
}

export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
