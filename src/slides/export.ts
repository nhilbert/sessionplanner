import { type AssetScope, assetUrl } from '@/api'
import { themeUrl } from '@/domain/addresses'
import i18n from '@/i18n'
import type { DeckSlideRef } from '@/domain/deck'
import { cjkCodePoints, codePoints } from '@/domain/deck'
import { esc } from '@/domain/slides'
import { hostHtml, themeGround } from './SlideView'
import { inlineThemeFiles, isThemeMedia } from './themeFiles'
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

const toDataUrl = async (url: string, accepts?: (type: string) => boolean): Promise<string | null> => {
  const res = await fetch(url, accepts ? { redirect: 'error' } : undefined).catch(() => null)
  if (!res?.ok || (accepts && !accepts(res.headers.get('content-type') ?? ''))) return null
  const blob = await res.blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

/**
 * A theme's stylesheet with its fonts and logos inlined, so the file works without the server, and the theme the
 * slides are to name. A theme that no longer exists gives the built-in one, under its own name (its rules apply to
 * `[data-theme="default"]` only). Any other failure stops the export: the stylesheet of another theme, or none,
 * would give a file of unstyled slides without anyone noticing.
 */
async function themeCss(theme: string): Promise<{ id: string; css: string }> {
  if (theme === 'default') return { id: 'default', css: defaultThemeCss }
  const base = themeUrl(theme)
  const res = await fetch(`${base}theme.css`).catch(() => null)
  if (res?.status === 404) return { id: 'default', css: defaultThemeCss }
  if (!res?.ok) throw new Error(i18n.t('slides.themeUnavailable'))
  return { id: theme, css: await inlineThemeFiles(await res.text(), base, (url) => toDataUrl(url, isThemeMedia)) }
}

/** Whether a stylesheet names a font family in a font stack, quoted ('Inter Variable') or not (Lato). */
export const namesFamily = (css: string, family: string): boolean => {
  const name = family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(['"])${name}\\1|(^|[\\s:,(])${name}\\s*([,;})!]|$)`, 'm').test(css)
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

/**
 * Paging in the file, as in the app's presentation. A slide that builds (docs/slide-builds.md) carries the host's
 * numbers on its units (data-b, src/domain/build.ts): `k` is the stage shown, a step forward brings the next stage and
 * then the next slide, a step back takes the last stage away and then goes to the slide before, whole. Shift with an
 * arrow pages whole slides, A shows all of the slide at once. The stylesheet hides what waits (b-wait) and moves what
 * arrives (b-in); on paper everything shows.
 */
const SCRIPT = `(function(){var s=document.querySelectorAll('.deck > section.slide'),n=Math.min(Math.max(parseInt(location.hash.slice(1)||'1',10)||1,1),s.length)-1,k=0,hint=document.querySelector('.hint');
function fit(){var z=Math.min(innerWidth/1280,innerHeight/720);document.querySelector('.deck').style.setProperty('--s',z)}
function units(){return s[n].querySelectorAll('[data-b]')}
function count(){var u=units(),m=0;for(var j=0;j<u.length;j++)m=Math.max(m,+u[j].getAttribute('data-b'));return m}
function paint(arrive){var u=units();for(var j=0;j<u.length;j++){var b=+u[j].getAttribute('data-b');u[j].classList.toggle('b-wait',b>k);u[j].classList.toggle('b-in',!!arrive&&b===k)}}
function show(i,whole){n=Math.min(Math.max(i,0),s.length-1);for(var j=0;j<s.length;j++)s[j].classList.toggle('current',j===n);k=whole?count():0;paint();history.replaceState(null,'','#'+(n+1));hint.textContent=(n+1)+' / '+s.length}
function step(d,whole){if(d>0){if(!whole&&k<count()){k++;paint(true)}else if(n<s.length-1)show(n+1)}else if(!whole&&k>0){k--;paint()}else if(n>0)show(n-1,true)}
addEventListener('resize',fit);addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'||e.key==='Enter')step(1,e.shiftKey&&e.key==='ArrowRight');else if(e.key==='ArrowLeft'||e.key==='PageUp'||e.key==='Backspace')step(-1,e.shiftKey&&e.key==='ArrowLeft');else if(e.key==='Home')show(0);else if(e.key==='End')show(s.length-1);else if((e.key==='a'||e.key==='A')&&!e.ctrlKey&&!e.metaKey&&!e.altKey){k=count();paint()}else if(e.key==='f'&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen();else return;e.preventDefault()});
addEventListener('click',function(e){step(e.clientX<innerWidth/3?-1:1)});var x0=null;addEventListener('touchstart',function(e){x0=e.touches[0].clientX});addEventListener('touchend',function(e){if(x0===null)return;var d=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(d)>40)step(d<0?1:-1)});
fit();show(n)})();`

/** A document language tag from the app's language: "de" → "de-DE". */
export const docLang = (lang: string): string => (lang.includes('-') ? lang : lang === 'de' ? 'de-DE' : lang === 'en' ? 'en-US' : lang)

export interface ExportOptions {
  title: string
  theme: string
  scope: AssetScope
  chrome: string
  lang: string
  part?: (p: { n: number; of: number }) => string
}

/**
 * The deck as self-contained pieces: every slide's markup with the footer line and its pictures as data, and one
 * stylesheet with the theme, its fonts and logos and the glyph slices the deck needs. The HTML file and the PDF are
 * made from these, so both show the slides as the app does without the server. `staged` numbers the units of the
 * slides that build (src/domain/build.ts), for a file that plays them; without it every slide stands whole.
 */
export async function standaloneDeck(deck: DeckSlideRef[], options: ExportOptions, staged = false): Promise<{ css: string; sections: string[]; theme: string }> {
  const assets = new Map<string, string>()
  const sections: string[] = []
  const ground = themeGround(options.theme)
  for (const [i, slide] of deck.entries()) {
    let html = hostHtml(slide.html, options.scope, { label: options.chrome, n: i + 1, part: slide.part && options.part ? options.part(slide.part) : undefined }, ground, staged)
    for (const m of [...slide.html.matchAll(/asset:([0-9a-f]{16,64})/g)]) {
      const hash = m[1]
      if (!assets.has(hash)) assets.set(hash, (await toDataUrl(assetUrl(options.scope, hash, ground))) ?? '')
      html = html.split(assetUrl(options.scope, hash, ground)).join(assets.get(hash) || '')
    }
    sections.push(html)
  }
  const text = sections.join('')
  const { id, css: theme } = await themeCss(options.theme)
  const points = codePoints(text)
  const hosted = await Promise.all(HOSTED.filter((f) => namesFamily(theme, f.family)).map((f) => inlineFontFaces(f.css, f.files, points)))
  const fonts = [...hosted, await inlineFontFaces(notoCss, notoFiles, cjkCodePoints(text))]
  return { css: [slidesCss.replace(/@import[^;]+;/g, ''), theme, ...fonts].join('\n'), sections, theme: id }
}

/**
 * One self-contained HTML file of the deck: stylesheet, theme with fonts and logos, the glyph font slices the
 * deck needs, pictures as data, a few lines of script to page through. Opens from a USB stick, prints to 16:9 pages.
 */
export async function exportDeckHtml(deck: DeckSlideRef[], options: ExportOptions): Promise<Blob> {
  const { css, sections, theme } = await standaloneDeck(deck, options, true)
  const doc = `<!doctype html>
<html lang="${esc(options.lang)}" data-theme="${esc(theme)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(options.title)}</title>
<style>${css}\n${STAGE_CSS}</style></head>
<body><div class="deck">${sections.join('\n')}</div><div class="hint"></div><script>${SCRIPT}</script></body></html>`
  return new Blob([doc], { type: 'text/html;charset=utf-8' })
}
