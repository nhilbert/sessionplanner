import { type AssetScope, assetUrl } from '@/api'
import type { DeckSlideRef } from '@/domain/deck'
import { cjkCodePoints, codePoints } from '@/domain/deck'
import { esc } from '@/domain/slides'
import { hostHtml } from './SlideView'
import slidesCss from './slides.css?raw'
import defaultThemeCss from './themes/default.css?raw'
import notoCss from '@fontsource/noto-sans-jp/400.css?raw'
import interCss from '@fontsource-variable/inter/index.css?raw'
import manropeCss from '@fontsource-variable/manrope/index.css?raw'
import serifCss from '@fontsource-variable/source-serif-4/index.css?raw'
import lato300 from '@fontsource/lato/300.css?raw'
import lato400 from '@fontsource/lato/400.css?raw'
import lato400i from '@fontsource/lato/400-italic.css?raw'
import lato700 from '@fontsource/lato/700.css?raw'
import lato900 from '@fontsource/lato/900.css?raw'

type FontFiles = Record<string, () => Promise<string>>
const notoFiles = import.meta.glob('/node_modules/@fontsource/noto-sans-jp/files/*-400-normal.woff2', { query: '?url', import: 'default' }) as FontFiles
/**
 * The fonts the app hosts for themes (src/domain/theme.ts; Inter is also the built-in theme's): the file carries the
 * faces a theme names, so it breaks lines as the app and the printout do.
 */
const HOSTED: { family: string; css: string; files: FontFiles }[] = [
  { family: 'Inter Variable', css: interCss, files: import.meta.glob('/node_modules/@fontsource-variable/inter/files/inter-*-wght-normal.woff2', { query: '?url', import: 'default' }) as FontFiles },
  { family: 'Manrope Variable', css: manropeCss, files: import.meta.glob('/node_modules/@fontsource-variable/manrope/files/manrope-*-wght-normal.woff2', { query: '?url', import: 'default' }) as FontFiles },
  { family: 'Source Serif 4 Variable', css: serifCss, files: import.meta.glob('/node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-*-wght-normal.woff2', { query: '?url', import: 'default' }) as FontFiles },
  // Lato is a static family: the weights the slides use (light, regular, italic, bold, black), each its own file.
  { family: 'Lato', css: [lato300, lato400, lato400i, lato700, lato900].join('\n'), files: import.meta.glob('/node_modules/@fontsource/lato/files/lato-*-{300,400,700,900}-{normal,italic}.woff2', { query: '?url', import: 'default' }) as FontFiles },
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

/** Whether a unicode-range ("U+0000-00FF,U+0131") covers one of the code points. */
const covers = (ranges: string, points: Set<number>): boolean =>
  ranges.split(',').some((r) => {
    const m = /U\+([0-9a-f]+)(?:-([0-9a-f]+))?/i.exec(r.trim())
    if (!m) return false
    const lo = parseInt(m[1], 16)
    const hi = m[2] ? parseInt(m[2], 16) : lo
    for (const p of points) if (p >= lo && p <= hi) return true
    return false
  })

/** The @font-face rules of a font package that the deck's characters need, with their files inlined. */
async function inlineFontFaces(css: string, files: FontFiles, points: Set<number>): Promise<string> {
  if (!points.size) return ''
  const out: string[] = []
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const ranges = /unicode-range:\s*([^;]+);/.exec(block)?.[1]
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1]
    if (!file || (ranges && !covers(ranges, points))) continue
    const loader = Object.entries(files).find(([p]) => p.endsWith(`/${file}`))?.[1]
    const url = loader && (await loader().catch(() => null))
    const data = url && (await toDataUrl(url))
    if (data) out.push(block.replace(/url\(\.\/files\/[^)]+\)/, `url(${data})`))
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
export async function exportDeckHtml(deck: DeckSlideRef[], options: { title: string; theme: string; scope: AssetScope; chrome: string; lang: string; part?: (p: { n: number; of: number }) => string }): Promise<Blob> {
  const assets = new Map<string, string>()
  const sections: string[] = []
  for (const [i, slide] of deck.entries()) {
    let html = hostHtml(slide.html, options.scope, { label: options.chrome, n: i + 1, part: slide.part && options.part ? options.part(slide.part) : undefined })
    for (const m of [...slide.html.matchAll(/asset:([0-9a-f]{16,64})/g)]) {
      const hash = m[1]
      if (!assets.has(hash)) assets.set(hash, (await toDataUrl(assetUrl(options.scope, hash))) ?? '')
      html = html.split(assetUrl(options.scope, hash)).join(assets.get(hash) || '')
    }
    sections.push(html)
  }
  const text = sections.join('')
  const theme = await themeCss(options.theme)
  const points = codePoints(text)
  const hosted = await Promise.all(HOSTED.filter((f) => theme.includes(`'${f.family}'`)).map((f) => inlineFontFaces(f.css, f.files, points)))
  const fonts = [...hosted, await inlineFontFaces(notoCss, notoFiles, cjkCodePoints(text))]
  const css = [slidesCss.replace(/@import[^;]+;/g, ''), theme, ...fonts, STAGE_CSS].join('\n')
  const doc = `<!doctype html>
<html lang="${esc(options.lang)}" data-theme="${esc(options.theme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(options.title)}</title>
<style>${css}</style></head>
<body><div class="deck">${sections.join('\n')}</div><div class="hint"></div><script>${SCRIPT}</script></body></html>`
  return new Blob([doc], { type: 'text/html;charset=utf-8' })
}
