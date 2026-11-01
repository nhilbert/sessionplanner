/**
 * The slide format as data, for the agents' connector (docs/slides.md, sections 2 and 3): the rules an agent
 * needs to write markup, and every layout of the catalogue with its purpose, its structure and a complete
 * example that the sanitiser (slides.ts) leaves unchanged. Served by the MCP tool slide_format.
 */

export interface SlideLayoutDoc {
  layout: string
  /** What the layout is for. */
  use: string
  /** The markup the layout expects, in CSS-selector shorthand. */
  structure: string
  /** Modifier classes and optional parts. */
  options?: string
  /** The app generates slides of this layout from the workshop (deck_outline); written only for a special case. */
  generated?: true
  example: string
}

export const SLIDE_FORMAT = {
  slide:
    'A slide is one <section class="slide LAYOUT"> in a small HTML subset, designed for 1280 × 720 (the host scales it). Inside: an optional <header> (div.eyebrow, h2 title, p.lead), one content block in the layout\'s structure, an optional <footer><span class="source">…</span></footer>. Title, section, statement, quote, break and closing slides have no header: title, section, statement and break put their text in div.text, quote in a blockquote with cite, closing directly in the section. The host adds the footer line, the logo and the theme; the slide must not contain them.',
  elements: 'section header footer div span h1 h2 h3 p ul ol li dl dt dd strong em br blockquote cite figure figcaption img table thead tbody tr th td aside code pre small sub sup; SVG: svg g path rect circle ellipse line polyline polygon text tspan title desc',
  attributes: 'class, role, aria-label; on img: src (asset:<hash> only), alt, width, height; in SVG: viewBox and the geometry and presentation attributes (x y width height r rx ry cx cy d points x1 y1 x2 y2 transform fill fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray text-anchor font-size opacity …)',
  forbidden: 'style, id, event handlers, script, iframe, links (a href), use, foreignObject, any external address, picture data in the markup. Everything else is removed on write, so read the slide back (slide_get) after writing it.',
  classes: {
    eyebrow: 'kicker above the title (div.eyebrow in the header or in div.text)',
    tag: 'a pill in front of an exercise title: <h2><span class="tag">Übung</span> Title</h2>',
    lead: 'the line under the title (p.lead)',
    source: 'the source in the footer (span.source) or a figcaption',
    muted: 'quieter text',
    accent: 'highlighted text, a highlighted cell or box',
    todo: 'marks an element the author still has to check; the preview flags it',
  },
  svg: 'Colours in SVG come from the theme classes, never from literal values: fills f-accent f-accent-deep f-accent-2 f-accent-3 f-accent-4 f-surface f-surface-2 f-title f-bg; strokes s-accent s-line s-fg; text t t-small t-display t-on (on an accent fill). Draw simple shapes, matrices, pyramids, cycles and curves as SVG on a viewBox of about 1152 × 470; never as pictures.',
  pictures: 'A picture is <img src="asset:<hash>" alt="…">. Only hashes that already exist can be used: a pool slide or another slide shows them (slide_get lists a slide\'s assets). Agents cannot upload pictures; write the slide without one or copy a pool slide.',
  text: 'The deck\'s language and words: German typographic quotes „…“, no emoji, no trailing period on titles, no ALL CAPS, one li per point, at most two list levels, two to five cards or steps per slide. Keep a slide to what fits 1280 × 720 at the layout\'s type size: about 6 bullets, 5 cards, 11 agenda lines.',
  generated: 'The app generates the title slide, the agenda slide per day (with the computed times) and a break slide for every break without slides of its own, and shows them in the deck (deck_outline). Write a title, agenda, break or closing slide yourself only for a special case.',
  choosing: 'Pick the layout by what the slide does: one sentence that carries the slide is statement, parallel points are cards, a sequence is steps, letters with meanings are acronym, labelled boxes with guiding questions are canvas, a 2 × 2 is matrix, a shape diagram is model, an exercise with task and steps is exercise, text beside a picture is split, everything else that is text is list.',
}

const PICTURE = 'asset:3f2a9c1e5b7d4a6f'

export const SLIDE_LAYOUTS: SlideLayoutDoc[] = [
  {
    layout: 'title',
    use: 'the first slide of a workshop or day',
    structure: 'div.text > div.eyebrow + h1 + p.subtitle? + p.meta?; an optional full-bleed figure > img before div.text',
    generated: true,
    example: '<section class="slide title"><div class="text"><div class="eyebrow">Teamtag · 10. November 2026</div><h1>Zusammenarbeit im neuen Team</h1><p class="subtitle">Beispiel GmbH</p><p class="meta">Bonn</p></div></section>',
  },
  {
    layout: 'section',
    use: 'a divider between topics',
    structure: 'div.text > div.eyebrow? + h1 + p.lead? + ul.list?; an optional div.glyph with a large character (and a small caption) on the right',
    example: '<section class="slide section"><div class="text"><div class="eyebrow">Teil 2</div><h1>Feedback</h1><p class="lead">Wie wir einander sagen, was wir sehen</p></div></section>',
  },
  {
    layout: 'agenda',
    use: 'the plan of a day, numbered, with optional times or a picture',
    structure: 'ol.agenda > li > span.when? + span; or ol.blocks > li > div.head > h3 + span.when, then p; wrap ol.agenda and a figure in div.cols for a picture beside the list',
    options: 'span.break on a pause; ol.agenda.many for more than eight lines (eleven at most)',
    generated: true,
    example: '<section class="slide agenda"><header><h2>Agenda</h2></header><ol class="agenda"><li><span class="when">09:00</span><span>Ankommen und Erwartungen</span></li><li><span class="when">09:45</span><span>Rollen im Team</span></li><li><span class="when">10:45</span><span class="break">Pause</span></li><li><span class="when">11:00</span><span>Feedback geben</span></li></ol></section>',
  },
  {
    layout: 'break',
    use: 'a pause with its end time',
    structure: 'div.text > h1 + p.until (with the end time in strong); an optional figure > img on the right half',
    generated: true,
    example: '<section class="slide break"><div class="text"><h1>Pause</h1><p class="until">15 Minuten · <strong>bis 10:45</strong></p></div></section>',
  },
  {
    layout: 'closing',
    use: 'the last slide, on the theme\'s field colour',
    structure: 'div.logo (the theme\'s logo, empty element) + h1 + p',
    generated: true,
    example: '<section class="slide closing"><div class="logo"></div><h1>Danke für heute</h1><p>Bis zum nächsten Mal</p></section>',
  },
  {
    layout: 'statement',
    use: 'one sentence that carries the slide, a question for the group',
    structure: 'div.text > div.eyebrow? + p.big + p.sub?',
    options: 'div.text.long for a statement of more than about twelve words',
    example: '<section class="slide statement"><div class="text"><div class="eyebrow">Leitfrage</div><p class="big">Was braucht dieses Team, um gut zu entscheiden?</p><p class="sub">Zwei Minuten still nachdenken, dann zu zweit austauschen</p></div></section>',
  },
  {
    layout: 'quote',
    use: 'a quotation with attribution',
    structure: 'blockquote > p + p.sub?, then cite',
    example: '<section class="slide quote"><blockquote><p>Wer fragt, führt.</p><p class="sub">Eine Redewendung aus der Moderationspraxis</p></blockquote><cite>Überliefert</cite></section>',
  },
  {
    layout: 'list',
    use: 'bullet points, one or two levels; rules; literature; points with a heading each',
    structure: 'header, then ul.list or ol.list > li (a nested ul for a second level)',
    options: '.compact (smaller type, more points), .two (two columns), .rows (a strong heading at the start of each point)',
    example: '<section class="slide list"><header><h2>Regeln für heute</h2><p class="lead">Damit alle zu Wort kommen</p></header><ul class="list"><li>Ausreden lassen</li><li>Ich-Botschaften<ul><li>„Ich habe bemerkt …“ statt „Du immer …“</li></ul></li><li>Handys bleiben in der Tasche</li></ul></section>',
  },
  {
    layout: 'cards',
    use: 'two to five parallel points with heading and text, optional picture, number or short list',
    structure: 'header, then ul.cards.cols-N > li > img.icon? + div.eyebrow? + h3 + (p | ul.list)',
    options: '.numbered (a counter on each card), .plain (no surface, picture cropped to a band), .plain.contain (illustrations shown whole, labels aligned below), .picture (the picture fills the top of the card), .picture.contain (book covers); cols-2 to cols-5, default three',
    example: '<section class="slide cards"><header><h2>Drei Arten von Feedback</h2></header><ul class="cards cols-3 numbered"><li><h3>Wertschätzung</h3><p>Was gut läuft und bleiben soll</p></li><li><h3>Coaching</h3><p>Was beim nächsten Mal anders gehen könnte</p></li><li><h3>Bewertung</h3><p>Wo jemand im Vergleich zur Erwartung steht</p></li></ul><footer><span class="source">Nach einem gängigen Feedbackmodell</span></footer></section>',
  },
  {
    layout: 'split',
    use: 'text beside a picture or diagram; a definition with an illustration',
    structure: 'header, then div.split > div.text (p.lead, p, p.small, h3, ul.list) + figure > img (or svg)',
    options: '.figure-left, .wide-text',
    example: '<section class="slide split"><header><h2>Was ich sehe und was andere sehen</h2></header><div class="split"><div class="text"><p class="lead">Vier Felder der Selbst- und Fremdwahrnehmung</p><ul class="list"><li>Öffentlich: beiden bekannt</li><li>Blinder Fleck: nur den anderen bekannt</li><li>Privat: nur mir bekannt</li></ul></div><figure><img src="' + PICTURE + '" alt="Vier Felder"></figure></div></section>',
  },
  {
    layout: 'figure',
    use: 'one large picture with a caption',
    structure: 'header?, then figure.main > img + figcaption?',
    options: '.full on the section for a picture that fills the slide',
    example: '<section class="slide figure"><header><h2>Das Ergebnis der Kartenabfrage</h2></header><figure class="main"><img src="' + PICTURE + '" alt="Pinnwand mit Karten"><figcaption>Foto vom Vormittag</figcaption></figure></section>',
  },
  {
    layout: 'exercise',
    use: 'an exercise: the task, its steps, optionally the facts',
    structure: 'header > h2 (span.tag + title) + p.lead (the question or goal), then div.exercise > ol.steps + aside.facts? > dl > dt + dd (Dauer, Sozialform, Material)',
    options: 'the facts panel only with values the plan gives; without it the steps take the width',
    example: '<section class="slide exercise"><header><h2><span class="tag">Übung</span> Feedback in Dreiergruppen</h2><p class="lead">Jede Person gibt einmal Feedback, bekommt einmal Feedback und beobachtet einmal</p></header><div class="exercise"><ol class="steps"><li>Beobachtung schildern, ohne zu bewerten</li><li>Wirkung auf mich benennen</li><li>Wunsch für das nächste Mal</li></ol><aside class="facts"><dl><dt>Dauer</dt><dd>30 Minuten</dd><dt>Sozialform</dt><dd>Dreiergruppen</dd><dt>Material</dt><dd>Beobachtungsbogen</dd></dl></aside></div></section>',
  },
  {
    layout: 'steps',
    use: 'a sequence or process, three to five steps',
    structure: 'header, then ol.flow > li > div.eyebrow? + h3 + p',
    options: 'ol.flow.plain without the arrows',
    example: '<section class="slide steps"><header><h2>So läuft eine Retrospektive</h2></header><ol class="flow"><li><h3>Sammeln</h3><p>Was lief gut, was nicht</p></li><li><h3>Verstehen</h3><p>Muster hinter den Punkten finden</p></li><li><h3>Entscheiden</h3><p>Ein bis zwei Verbesserungen festlegen</p></li></ol></section>',
  },
  {
    layout: 'matrix',
    use: 'a 2 × 2 with axis labels',
    structure: 'header, then div.matrix > div.axis-y (two span) + div.cells (four div.cell > h3 + p) + div.axis-x (two span)',
    options: 'div.cell.accent',
    example: '<section class="slide matrix"><header><h2>Wichtig und dringend</h2></header><div class="matrix"><div class="axis-y"><span>Wichtig</span><span>Weniger wichtig</span></div><div class="cells"><div class="cell accent"><h3>Sofort</h3><p>Selbst erledigen</p></div><div class="cell"><h3>Planen</h3><p>Einen Termin setzen</p></div><div class="cell"><h3>Delegieren</h3><p>Abgeben</p></div><div class="cell"><h3>Lassen</h3><p>Streichen</p></div></div><div class="axis-x"><span>Dringend</span><span>Weniger dringend</span></div></div></section>',
  },
  {
    layout: 'acronym',
    use: 'letters and their meaning (GROW, VUCA, SCAMPER)',
    structure: 'header, then dl.acronym > div > dt (the letter) + dd > strong + span',
    options: '.compact for more than five letters',
    example: '<section class="slide acronym"><header><h2>Ein gutes Ziel ist SMART</h2></header><dl class="acronym"><div><dt>S</dt><dd><strong>Spezifisch</strong><span>Was genau soll erreicht sein?</span></dd></div><div><dt>M</dt><dd><strong>Messbar</strong><span>Woran merken wir es?</span></dd></div><div><dt>A</dt><dd><strong>Attraktiv</strong><span>Wollen wir das wirklich?</span></dd></div><div><dt>R</dt><dd><strong>Realistisch</strong><span>Geht das mit unseren Mitteln?</span></dd></div><div><dt>T</dt><dd><strong>Terminiert</strong><span>Bis wann?</span></dd></div></dl></section>',
  },
  {
    layout: 'canvas',
    use: 'a grid of labelled boxes with guiding questions',
    structure: 'header, then div.canvas.cols-N > div.box > h3 + p',
    options: 'div.box.wide (two columns), div.box.tall (two rows), div.box.accent; cols-2 to cols-4, default three',
    example: '<section class="slide canvas"><header><h2>Team-Canvas</h2></header><div class="canvas cols-3"><div class="box accent"><h3>Zweck</h3><p>Wofür gibt es uns?</p></div><div class="box"><h3>Rollen</h3><p>Wer macht was?</p></div><div class="box"><h3>Regeln</h3><p>Wie arbeiten wir zusammen?</p></div><div class="box wide"><h3>Nächste Schritte</h3><p>Was tun wir bis zum nächsten Treffen?</p></div><div class="box"><h3>Stärken</h3><p>Was können wir besonders gut?</p></div></div></section>',
  },
  {
    layout: 'model',
    use: 'a diagram as inline SVG: pyramid, cycle, curve, triangle',
    structure: 'header, then figure.model > svg (viewBox about 0 0 1152 470, role="img", aria-label) + figcaption?',
    options: 'shapes with the fill classes, labels as text with the text classes; written out with closing tags',
    example: '<section class="slide model"><header><h2>Drei Ebenen eines Konflikts</h2></header><figure class="model"><svg viewBox="0 0 1152 470" role="img" aria-label="Pyramide mit drei Ebenen"><polygon class="f-accent" points="576,20 416,170 736,170"></polygon><polygon class="f-accent-2" points="396,190 256,320 896,320 756,190"></polygon><polygon class="f-surface-2" points="236,340 96,460 1056,460 916,340"></polygon><g class="t-display" text-anchor="middle"><text class="t-on" x="576" y="130">Sache</text><text x="576" y="270">Beziehung</text><text x="576" y="415">Werte</text></g></svg><figcaption>Je tiefer die Ebene, desto länger dauert die Klärung</figcaption></figure></section>',
  },
  {
    layout: 'table',
    use: 'a small table',
    structure: 'header, then table > thead + tbody; footer with the source',
    options: 'table.compact for more rows; td.good and td.bad for a verdict',
    example: '<section class="slide table"><header><h2>Zwei Wege zur Entscheidung</h2></header><table class="compact"><thead><tr><th></th><th>Konsens</th><th>Konsent</th></tr></thead><tbody><tr><td><strong>Frage</strong></td><td>Sind alle dafür?</td><td>Hat jemand einen schwerwiegenden Einwand?</td></tr><tr><td><strong>Tempo</strong></td><td class="bad">Langsam</td><td class="good">Zügig</td></tr></tbody></table><footer><span class="source">Eigene Darstellung</span></footer></section>',
  },
]
