import type { ThemeTokens } from './theme.ts'

/**
 * Template families (docs/slide-design-playful.md): the calm family is the stylesheet itself; the playful family lays
 * its decoration over the same layouts – one disc per slide cut by the slide's edge, numerals in filled discs, the wavy
 * line under titles, the facts of an exercise on the dark disc, flat figures whole on a disc – as rules the theme's
 * stylesheet carries under the theme's selector. A theme chooses its family with the `family` token; every theme
 * without one is calm, so nothing changes for existing decks.
 */

export const FAMILY_KEYS = ['calm', 'playful'] as const
export type FamilyKey = (typeof FAMILY_KEYS)[number]

/** The wavy line as a data URI in the given colour. */
const wave = (color: string): string =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 20'%3E%3Cpath d='M0 10 Q 20 0 40 10 Q 60 20 80 10 Q 100 0 120 10 Q 140 20 160 10 Q 180 0 200 10' fill='none' stroke='${color.replace('#', '%23')}' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E")`

/* The rules of the playful family; THEME is replaced by the theme's selector, the waves by the theme's colours.
   Colour roles: --accent leads (the section disc, the figures), --accent-2 answers (the title and split discs, the
   highlighted word), --field is the dark pole (the large title disc, the statement ground, the facts disc). */
const PLAYFUL = String.raw`
THEME { --numeral-weight: 800; --kicker: var(--accent); --mark-radius: 50%; --mark-size: 12px; }
/* ---- the wavy line: the one hand gesture, under every title ---- */
THEME .slide > header h2::after { content: ''; display: block; width: 160px; height: 20px; margin-top: 12px; background: WAVE_ACCENT no-repeat left center / contain; }
THEME .slide.title h1::after, THEME .slide.section h1::after { content: ''; display: block; width: 200px; height: 20px; margin-top: 24px; background: WAVE_ACCENT no-repeat left center / contain; }
THEME .slide.section h1::after { background-image: WAVE_ACCENT2; }
/* ---- the chrome: the number in a disc ---- */
THEME .slide > footer.chrome span:last-child { border-radius: 50%; color: var(--fg); }
/* ---- title: the deep-teal disc from the right and bottom edges, the sun disc wholly on it with the figure, a teal dot;
        the text above the colour logo at the bottom left ---- */
THEME .slide.title {
  background: radial-gradient(circle at 1060px 580px, var(--accent-2) 359px, transparent 361px), radial-gradient(circle at 1040px 620px, var(--field) 559px, transparent 561px), var(--bg);
}
THEME .slide.title::before { content: ''; position: absolute; left: 1130px; top: 120px; width: 100px; height: 100px; border-radius: 50%; background: var(--accent); }
THEME .slide.title::after { content: ''; position: absolute; left: 64px; bottom: 36px; width: 180px; height: 48px; background: var(--logo) no-repeat left center / contain; z-index: 2; }
THEME .slide.title:has(figure)::after { background-image: var(--logo); }
THEME .slide.title > .text { max-width: 520px; margin-bottom: 96px; gap: 20px; }
THEME .slide.title .subtitle { font-size: 24px; }
THEME .slide.title > figure { top: 300px; left: 860px; right: auto; bottom: auto; width: 400px; height: 364px; z-index: 0; }
THEME .slide.title > figure img { object-fit: contain; object-position: center bottom; }
THEME .slide.title > figure::after { content: none; }
/* ---- section: the teal disc from the left carries the numeral (the glyph) or the picture; the title at the right ---- */
THEME .slide.section { background: radial-gradient(circle at 200px 360px, var(--accent) 499px, transparent 501px), var(--bg); }
THEME .slide.section > .text { position: static; margin: auto 0 auto 696px; max-width: 460px; gap: 24px; }
THEME .slide.section .eyebrow, THEME .slide.section:not(:has(figure)) .eyebrow { position: absolute; left: 64px; top: 56px; color: var(--fg); }
THEME .slide.section h1 { font-size: 64px; line-height: 1.02; letter-spacing: -0.03em; }
THEME .slide.section .lead { color: var(--fg-2); }
THEME .slide.section ul.list { color: var(--fg); }
THEME .slide.section .glyph { left: 64px; right: auto; top: 170px; transform: none; font: 800 300px/0.9 var(--font-display), 'Noto Sans JP'; letter-spacing: -0.06em; color: var(--on-field); opacity: 1; }
THEME .slide.section .glyph small { display: none; }
THEME .slide.section > figure { left: 60px; right: auto; top: 160px; width: 560px; height: 420px; }
THEME .slide.section > figure img { object-fit: contain; object-position: center; }
THEME .slide.section:has(figure) .glyph { display: none; }
/* ---- statement: the deep teal with cream text, the key word in sun, a cream disc at the bottom right ---- */
THEME .slide.statement { background: radial-gradient(circle at 1100px 600px, var(--bg) 299px, transparent 301px), var(--field); color: var(--on-field); }
THEME .slide.statement > .text { max-width: 700px; }
THEME .slide.statement .big, THEME .slide.statement .eyebrow { color: var(--on-field); }
THEME .slide.statement .sub { color: var(--on-field); opacity: 0.85; }
THEME .slide.statement .big strong, THEME .slide.statement .big .accent, THEME .slide.statement .big em { color: var(--accent-2); font-style: normal; font-weight: inherit; }
THEME .slide.statement > footer { color: var(--on-field); }
THEME .slide.statement > footer.chrome span:last-child { background: var(--accent-2); }
THEME .slide.statement > footer.chrome .part { border-color: rgba(251,243,228,0.4); }
/* ---- quote ---- */
THEME .slide.quote cite { color: var(--accent-deep); }
/* ---- numerals as filled discs: cards, steps, flow, agenda, ordered lists; colours in turn (teal, sun, deep teal) ---- */
THEME .slide ul.cards.numbered > li::before, THEME .slide ol.flow > li::before {
  content: counter(n, decimal-leading-zero); display: flex; align-items: center; justify-content: center; width: 120px; height: 120px; border-radius: 50%;
  font-size: 44px; letter-spacing: -0.04em; color: var(--fg); background: var(--accent); margin-bottom: 20px;
}
THEME .slide ul.cards.cols-4.numbered > li::before, THEME .slide ul.cards.cols-5.numbered > li::before { width: 88px; height: 88px; font-size: 32px; margin-bottom: 16px; }
THEME .slide ul.cards.numbered > li:nth-child(3n+2)::before, THEME .slide ol.flow > li:nth-child(3n+2)::before { background: var(--accent-2); }
THEME .slide ul.cards.numbered > li:nth-child(3n)::before, THEME .slide ol.flow > li:nth-child(3n)::before { background: var(--field); color: var(--on-field); }
THEME .slide ul.cards:not(.numbered):not(.picture) > li:not(:has(> img.icon))::before { width: 16px; height: 16px; border-radius: 50%; margin-bottom: 16px; }
THEME .slide ul.cards:not(.numbered):not(.picture) > li:nth-child(3n+2):not(:has(> img.icon))::before { background: var(--accent-2); }
THEME .slide ul.cards:not(.numbered):not(.picture) > li:nth-child(3n):not(:has(> img.icon))::before { background: var(--field); }
THEME .slide ol.steps > li::before, THEME .slide ol.list > li::before, THEME .slide ol.agenda > li::before {
  content: counter(n); display: flex; align-items: center; justify-content: center; border-radius: 50%; letter-spacing: 0; color: var(--fg); background: var(--accent);
}
THEME .slide ol.steps > li::before, THEME .slide ol.list > li::before { position: absolute; left: 0; margin-left: 0; line-height: 1; }
THEME .slide ol.steps > li:nth-child(4n+2)::before, THEME .slide ol.list > li:nth-child(3n+2)::before, THEME .slide ol.agenda > li:nth-child(3n+2)::before { background: var(--accent-2); }
THEME .slide ol.steps > li:nth-child(4n+3)::before, THEME .slide ol.list > li:nth-child(3n)::before, THEME .slide ol.agenda > li:nth-child(3n)::before { background: var(--field); color: var(--on-field); }
THEME .slide ol.steps > li::before { width: 48px; height: 48px; font-size: 22px; top: 8px; }
THEME .slide ol.steps:has(> li:nth-child(6)) > li::before { width: 36px; height: 36px; font-size: 17px; top: 6px; }
THEME .slide ol.list > li::before { width: 36px; height: 36px; font-size: 16px; top: 0.3em; }
THEME .slide ol.list:has(> li:nth-child(9)) > li::before { width: 28px; height: 28px; font-size: 13px; top: 0.2em; }
THEME .slide ol.agenda > li::before { width: 36px; height: 36px; font-size: 16px; align-self: center; }
THEME .slide dl.acronym dt { color: var(--accent-deep); }
/* ---- lists and rows: no hairlines, round marks in the three colours in turn ---- */
THEME .slide ul.list, THEME .slide ol.list, THEME .slide ol.steps, THEME .slide.agenda ol.agenda, THEME .slide dl.acronym { border-bottom: 0; }
THEME .slide ul.list > li, THEME .slide ol.list > li, THEME .slide ol.steps > li, THEME .slide.agenda ol.agenda > li, THEME .slide dl.acronym > div, THEME .slide.agenda ol.blocks > li { border-top: 0; }
THEME .slide ul.list > li { padding-top: 9px; padding-bottom: 9px; }
THEME .slide ul.list > li::before { top: 0.75em; }
THEME .slide .list.rows > li::before { top: 1.0em; }
THEME .slide ul.list > li:nth-child(3n+2)::before { background: var(--accent-2); }
THEME .slide ul.list > li:nth-child(3n)::before { background: var(--field); }
THEME .slide ul.list ul li::before { background: none; }
THEME .slide ol.timeline > li::before { width: 14px; height: 14px; top: -31px; }
THEME .slide ol.timeline > li:nth-child(3n+2)::before { background: var(--accent-2); }
THEME .slide ol.timeline > li:nth-child(3n)::before { background: var(--field); }
/* ---- split: the sun disc from the right (or the left) carries the figure whole; text in a 500 px column ---- */
THEME .slide:has(> .split:not(.figure-left) > figure > img) { background: radial-gradient(circle at 1060px 380px, var(--accent-2) 479px, transparent 481px), var(--bg); }
THEME .slide:has(> .split.figure-left > figure > img) { background: radial-gradient(circle at 220px 380px, var(--accent-2) 479px, transparent 481px), var(--bg); }
THEME .slide .split:has(> figure > img) { grid-template-columns: 500px minmax(0, 1fr); gap: 48px; }
THEME .slide .split.figure-left:has(> figure > img) { grid-template-columns: minmax(0, 1fr) 500px; }
THEME .slide .split figure:has(> img:only-child) { position: static; margin: 0; }
THEME .slide .split figure > img:only-child { position: absolute; inset: auto; left: 760px; top: 250px; width: 500px; height: 280px; object-fit: contain; object-position: center; }
THEME .slide .split.figure-left figure > img:only-child { left: 20px; }
THEME .slide:has(> .split:not(.figure-left) > figure > img) > footer .source { color: var(--fg); }
/* ---- figure: a picture whole on the ground ---- */
THEME .slide figure.main img { object-fit: contain; }
/* ---- exercise: the tag as a pill in sun, the facts on the deep-teal disc from the right ---- */
THEME .slide.exercise .tag { background: var(--accent-2); color: var(--fg); padding: 8px 16px; border-radius: 999px; letter-spacing: 0.16em; }
THEME .slide.exercise:has(aside.facts) { background: radial-gradient(circle at 1120px 380px, var(--field) 399px, transparent 401px), var(--bg); }
THEME .slide .exercise { grid-template-columns: minmax(0, 1fr) 460px; gap: 72px; }
THEME .slide aside.facts { background: none; border-radius: 0; padding: 0; position: absolute; left: 916px; top: 190px; width: 300px; }
THEME .slide aside.facts dl { gap: 20px; }
THEME .slide aside.facts dt { color: var(--accent-2); }
THEME .slide aside.facts dd { color: var(--on-field); }
THEME .slide.exercise:has(aside.facts) > footer .source { color: var(--on-field); }
/* ---- break: cream with the sun disc from the right and the picture on it ---- */
THEME .slide.break { background: radial-gradient(circle at 1060px 380px, var(--accent-2) 479px, transparent 481px), var(--bg); }
THEME .slide.break > figure { left: 760px; top: 250px; right: auto; bottom: auto; width: 500px; height: 280px; }
THEME .slide.break > figure img { object-fit: contain; object-position: center; }
THEME .slide.break .until strong { color: var(--accent-deep); }
/* ---- agenda: a picture whole beside the rows ---- */
THEME .slide.agenda .cols figure { margin: 0; }
THEME .slide.agenda .cols figure img { object-fit: contain; object-position: center bottom; }
/* ---- closing: the deep teal with the light logo ---- */
THEME .slide.closing { background: var(--field); color: var(--on-field); }
THEME .slide.closing .logo { background-image: var(--logo-light); }
THEME .slide.closing h1 { color: var(--on-field); }
THEME .slide.closing p { color: var(--on-field); opacity: 0.85; }
/* ---- diagrams: the SVG classes follow the colour roles; text on an accent fill stays ink ---- */
THEME .slide svg .t-on { fill: var(--fg); }
`

/** The decoration rules of a theme's family under its selector; empty for the calm family. */
export function familyCss(sel: string, tokens: ThemeTokens): string {
  if (tokens.family !== 'playful') return ''
  return PLAYFUL.replaceAll('WAVE_ACCENT2', wave(tokens.colors.accent2)).replaceAll('WAVE_ACCENT', wave(tokens.colors.accent)).replaceAll('THEME', sel).trim()
}
