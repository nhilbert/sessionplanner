import { useTranslation } from 'react-i18next'
import type { AssetScope } from '@/api'
import { type Block, emptyBox, emptyCard, emptyCell, emptyLetter, emptyStep, type LayoutSpec, layoutSpec, type SlideDoc, type Tone } from '@/domain/slideDoc'
import { Segmented, Select, SectionLabel } from '@/components/ui'
import { Area, Entries, Row, Text, Toggle, tr } from './fields'
import { PictureField } from './PicturePicker'

interface Props {
  doc: SlideDoc
  onChange: (doc: SlideDoc) => void
  onFocus: (path: string) => void
  scope: AssetScope
  /** Pictures a picker can offer (hashes used on slides of this step, entry or workshop). */
  known: string[]
}

/**
 * The fields of a slide, from its layout's schema (docs/slides.md, section 7): the header, the content parts the
 * layout holds, the footer; above them the layout's options. Each field edits one part of the document; the
 * preview follows at once.
 */
export function Inspector({ doc, onChange, onFocus, scope, known }: Props) {
  const { t } = useTranslation()
  const spec = layoutSpec(doc.layout)
  const set = (patch: Partial<SlideDoc>) => onChange({ ...doc, ...patch })
  const parts = new Set(spec?.parts ?? [])
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
  const f = (key: string, opts?: Record<string, unknown>) => tr(t, `editor.f.${key}`, opts)
  const markup = <span className="font-normal normal-case tracking-normal text-ink-3">{t('slides.markup')}</span>

  return (
    <div className="space-y-5">
      {spec && spec.options.length > 0 && <Options spec={spec} doc={doc} onChange={(options) => set({ options })} />}

      {doc.raw === undefined && spec?.generated && <p className="rounded-md bg-amber-soft px-2.5 py-1.5 text-[12px] leading-snug text-amber">{t('slides.generatedHint')}</p>}

      {(parts.has('header') || (doc.raw !== undefined && doc.header)) && (
        <section>
          <SectionLabel>{t('editor.header')}</SectionLabel>
          <div className="space-y-1.5">
            {doc.layout === 'exercise' && <Text path="header.tag" value={doc.header?.tag ?? ''} onChange={(tag) => set({ header: { ...header(doc), tag } })} onFocus={onFocus} placeholder={f('tag')} label={f('tag')} className="w-40" />}
            <Text path="header.eyebrow" value={doc.header?.eyebrow ?? ''} onChange={(eyebrow) => set({ header: { ...header(doc), eyebrow } })} onFocus={onFocus} placeholder={f('eyebrow')} label={f('eyebrow')} />
            <Area path="header.title" value={doc.header?.title ?? ''} onChange={(title) => set({ header: { ...header(doc), title } })} onFocus={onFocus} placeholder={f('title')} label={f('title')} className="font-medium text-[15px]" />
            <Area path="header.lead" value={doc.header?.lead ?? ''} onChange={(lead) => set({ header: { ...header(doc), lead } })} onFocus={onFocus} placeholder={f('lead')} label={f('lead')} />
          </div>
        </section>
      )}

      {parts.has('text') && spec?.textFields && (
        <section>
          <SectionLabel right={markup}>{t('editor.content')}</SectionLabel>
          <div className="space-y-1.5">
            {parts.has('logo') && (
              <Toggle checked={!!doc.logo} onChange={(logo) => set({ logo })}>
                {f('logo')}
              </Toggle>
            )}
            {spec.textFields.map((key) =>
              key === 'eyebrow' || key === 'meta' || key === 'until' ? (
                <Text key={key} path={`text.${key}`} value={doc.text?.[key] ?? ''} onChange={(v) => set({ text: { ...text(doc), [key]: v } })} onFocus={onFocus} placeholder={f(key)} label={f(key)} />
              ) : (
                <Area key={key} path={`text.${key}`} value={doc.text?.[key] ?? ''} onChange={(v) => set({ text: { ...text(doc), [key]: v } })} onFocus={onFocus} placeholder={f(key)} label={f(key)} className={key === 'title' || key === 'big' ? 'font-medium text-[15px]' : undefined} />
              ),
            )}
          </div>
        </section>
      )}

      {parts.has('quote') && (
        <section>
          <SectionLabel right={markup}>{t('editor.content')}</SectionLabel>
          <div className="space-y-1.5">
            <Area path="quote.text" value={doc.quote?.text ?? ''} onChange={(v) => set({ quote: { ...(doc.quote ?? { text: '', sub: '', cite: '' }), text: v } })} onFocus={onFocus} placeholder={f('quote')} label={f('quote')} rows={2} className="text-[15px]" />
            <Area path="quote.sub" value={doc.quote?.sub ?? ''} onChange={(v) => set({ quote: { ...(doc.quote ?? { text: '', sub: '', cite: '' }), sub: v } })} onFocus={onFocus} placeholder={f('sub')} label={f('sub')} />
            <Text path="quote.cite" value={doc.quote?.cite ?? ''} onChange={(v) => set({ quote: { ...(doc.quote ?? { text: '', sub: '', cite: '' }), cite: v } })} onFocus={onFocus} placeholder={f('cite')} label={f('cite')} />
          </div>
        </section>
      )}

      {parts.has('points') && (
        <Entries
          label={f('points')}
          items={doc.points ?? []}
          max={spec?.max}
          onChange={(points) => set({ points })}
          make={() => ({ text: '', children: [] })}
          render={(p, setP, i) => (
            <>
              <Area path={`points.${i}`} value={p.text} onChange={(v) => setP({ ...p, text: v })} onFocus={onFocus} placeholder={f('point')} label={f('point')} />
              {doc.layout === 'list' && <Area path={`points.${i}.children`} value={p.children.join('\n')} onChange={(v) => setP({ ...p, children: lines(v) })} onFocus={onFocus} placeholder={f('children')} label={f('children')} className="text-[12px] text-ink-2" />}
            </>
          )}
        />
      )}

      {parts.has('cards') && (
        <Entries
          label={f('cards')}
          items={doc.cards ?? []}
          max={spec?.max}
          onChange={(cards) => set({ cards })}
          make={emptyCard}
          render={(c, setC, i) => (
            <>
              <PictureField path={`cards.${i}.image`} value={c.image} onChange={(image) => setC({ ...c, image })} onFocus={onFocus} scope={scope} known={known} />
              <Text path={`cards.${i}.eyebrow`} value={c.eyebrow} onChange={(v) => setC({ ...c, eyebrow: v })} onFocus={onFocus} placeholder={f('eyebrow')} label={f('eyebrow')} />
              <Area path={`cards.${i}.title`} value={c.title} onChange={(v) => setC({ ...c, title: v })} onFocus={onFocus} placeholder={f('title')} label={f('title')} className="font-medium" />
              <Area path={`cards.${i}.text`} value={c.text} onChange={(v) => setC({ ...c, text: v })} onFocus={onFocus} placeholder={f('text')} label={f('text')} />
              <Area path={`cards.${i}.points`} value={c.points.join('\n')} onChange={(v) => setC({ ...c, points: lines(v) })} onFocus={onFocus} placeholder={f('children')} label={f('children')} className="text-[12px] text-ink-2" />
            </>
          )}
        />
      )}

      {parts.has('steps') && (
        <Entries
          label={f('steps')}
          items={doc.steps ?? []}
          max={spec?.max}
          onChange={(steps) => set({ steps })}
          make={emptyStep}
          render={(s, setS, i) =>
            doc.layout === 'exercise' ? (
              <Area path={`steps.${i}`} value={s.text} onChange={(v) => setS({ ...s, text: v })} onFocus={onFocus} placeholder={f('step', { n: i + 1 })} label={f('step', { n: i + 1 })} />
            ) : (
              <>
                <Text path={`steps.${i}.eyebrow`} value={s.eyebrow} onChange={(v) => setS({ ...s, eyebrow: v })} onFocus={onFocus} placeholder={f('eyebrow')} label={f('eyebrow')} />
                <Area path={`steps.${i}.title`} value={s.title} onChange={(v) => setS({ ...s, title: v })} onFocus={onFocus} placeholder={f('title')} label={f('title')} className="font-medium" />
                <Area path={`steps.${i}.text`} value={s.text} onChange={(v) => setS({ ...s, text: v })} onFocus={onFocus} placeholder={f('text')} label={f('text')} />
              </>
            )
          }
        />
      )}

      {parts.has('facts') && (
        <Entries
          label={f('facts')}
          items={doc.facts ?? []}
          onChange={(facts) => set({ facts })}
          make={() => ({ term: '', value: '' })}
          render={(x, setX, i) => (
            <div className="grid grid-cols-[1fr_2fr] gap-1.5">
              <Text path={`facts.${i}.term`} value={x.term} onChange={(v) => setX({ ...x, term: v })} onFocus={onFocus} placeholder={f('term')} label={f('term')} />
              <Text path={`facts.${i}`} value={x.value} onChange={(v) => setX({ ...x, value: v })} onFocus={onFocus} placeholder={f('value')} label={f('value')} />
            </div>
          )}
        />
      )}

      {parts.has('blocks') && (
        <Entries
          label={f('blocks')}
          items={doc.blocks ?? []}
          onChange={(blocks) => set({ blocks })}
          make={(): Block => ({ kind: 'p', text: '' })}
          render={(b, setB, i) => (
            <>
              <Select
                value={b.kind}
                onChange={(e) => {
                  const kind = e.target.value as Block['kind']
                  setB(kind === 'list' ? { kind, points: b.kind === 'list' ? b.points : lines(b.text) } : { kind, text: b.kind === 'list' ? b.points.join('\n') : b.text })
                }}
                className="h-7 w-auto text-[12px]"
                aria-label={f('blocks')}
              >
                {(['lead', 'p', 'small', 'h3', 'list'] as const).map((k) => (
                  <option key={k} value={k}>
                    {tr(t, `editor.blockKind.${k}`)}
                  </option>
                ))}
              </Select>
              {b.kind === 'list' ? (
                <Area path={`blocks.${i}`} value={b.points.join('\n')} onChange={(v) => setB({ kind: 'list', points: lines(v) })} onFocus={onFocus} placeholder={f('children')} label={f('children')} />
              ) : (
                <Area path={`blocks.${i}`} value={b.text} onChange={(v) => setB({ ...b, text: v })} onFocus={onFocus} placeholder={f('text')} label={f('text')} />
              )}
            </>
          )}
        />
      )}

      {parts.has('rows') && (
        <Entries
          label={f('rows')}
          items={doc.rows ?? []}
          max={spec?.max}
          onChange={(rows) => set({ rows })}
          make={() => ({ when: '', text: '', isBreak: false })}
          render={(r, setR, i) => (
            <div className="flex flex-wrap items-center gap-1.5">
              <Text path={`rows.${i}.when`} value={r.when} onChange={(v) => setR({ ...r, when: v })} onFocus={onFocus} placeholder="09:00" label={f('when')} className="w-[72px] tnum" />
              <Text path={`rows.${i}`} value={r.text} onChange={(v) => setR({ ...r, text: v })} onFocus={onFocus} placeholder={f('text')} label={f('text')} className="min-w-0 flex-1" />
              <Toggle checked={r.isBreak} onChange={(isBreak) => setR({ ...r, isBreak })}>
                {f('isBreak')}
              </Toggle>
            </div>
          )}
        />
      )}

      {parts.has('matrix') && doc.matrix && (
        <section className="space-y-2">
          <Row label={f('axisY')}>
            <div className="grid grid-cols-2 gap-1.5">
              {([0, 1] as const).map((k) => (
                <Text key={k} path="matrix.axisY" value={doc.matrix!.axisY[k]} onChange={(v) => set({ matrix: { ...doc.matrix!, axisY: k === 0 ? [v, doc.matrix!.axisY[1]] : [doc.matrix!.axisY[0], v] } })} onFocus={onFocus} label={f('axisY')} />
              ))}
            </div>
          </Row>
          <Row label={f('axisX')}>
            <div className="grid grid-cols-2 gap-1.5">
              {([0, 1] as const).map((k) => (
                <Text key={k} path="matrix.axisX" value={doc.matrix!.axisX[k]} onChange={(v) => set({ matrix: { ...doc.matrix!, axisX: k === 0 ? [v, doc.matrix!.axisX[1]] : [doc.matrix!.axisX[0], v] } })} onFocus={onFocus} label={f('axisX')} />
              ))}
            </div>
          </Row>
          <Row label={f('matrix')}>
            <ul className="grid grid-cols-2 gap-1.5">
              {doc.matrix.cells.slice(0, 4).map((c, i) => (
                <li key={i} className="space-y-1 rounded-lg border border-line bg-surface-2/50 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-ink-3">{f('cell', { n: i + 1 })}</span>
                    <Toggle checked={c.accent} onChange={(accent) => set({ matrix: { ...doc.matrix!, cells: doc.matrix!.cells.map((x, k) => (k === i ? { ...x, accent } : x)) } })}>
                      {f('accent')}
                    </Toggle>
                  </div>
                  <Text path={`matrix.cells.${i}.title`} value={c.title} onChange={(v) => set({ matrix: { ...doc.matrix!, cells: doc.matrix!.cells.map((x, k) => (k === i ? { ...x, title: v } : x)) } })} onFocus={onFocus} placeholder={f('title')} label={f('title')} />
                  <Area path={`matrix.cells.${i}.text`} value={c.text} onChange={(v) => set({ matrix: { ...doc.matrix!, cells: doc.matrix!.cells.map((x, k) => (k === i ? { ...x, text: v } : x)) } })} onFocus={onFocus} placeholder={f('text')} label={f('text')} />
                </li>
              ))}
            </ul>
          </Row>
        </section>
      )}
      {parts.has('matrix') && !doc.matrix && <Toggle checked={false} onChange={() => set({ matrix: { axisY: ['', ''], axisX: ['', ''], cells: [emptyCell(), emptyCell(), emptyCell(), emptyCell()] } })}>{f('matrix')}</Toggle>}

      {parts.has('letters') && (
        <Entries
          label={f('letters')}
          items={doc.letters ?? []}
          max={spec?.max}
          onChange={(letters) => set({ letters })}
          make={emptyLetter}
          render={(l, setL, i) => (
            <div className="grid grid-cols-[56px_1fr] gap-1.5">
              <Text path={`letters.${i}.letter`} value={l.letter} onChange={(v) => setL({ ...l, letter: v })} onFocus={onFocus} placeholder={f('letter')} label={f('letter')} className="text-center font-semibold" />
              <div className="space-y-1.5">
                <Text path={`letters.${i}`} value={l.term} onChange={(v) => setL({ ...l, term: v })} onFocus={onFocus} placeholder={f('term')} label={f('term')} />
                <Area path={`letters.${i}.text`} value={l.text} onChange={(v) => setL({ ...l, text: v })} onFocus={onFocus} placeholder={f('text')} label={f('text')} />
              </div>
            </div>
          )}
        />
      )}

      {parts.has('boxes') && (
        <Entries
          label={f('boxes')}
          items={doc.boxes ?? []}
          max={spec?.max}
          onChange={(boxes) => set({ boxes })}
          make={emptyBox}
          render={(b, setB, i) => (
            <>
              <Text path={`boxes.${i}.title`} value={b.title} onChange={(v) => setB({ ...b, title: v })} onFocus={onFocus} placeholder={f('title')} label={f('title')} className="font-medium" />
              <Area path={`boxes.${i}`} value={b.text} onChange={(v) => setB({ ...b, text: v })} onFocus={onFocus} placeholder={f('text')} label={f('text')} />
              <div className="flex flex-wrap gap-1.5">
                <Toggle checked={b.wide} onChange={(wide) => setB({ ...b, wide })}>
                  {f('wide')}
                </Toggle>
                <Toggle checked={b.tall} onChange={(tall) => setB({ ...b, tall })}>
                  {f('tall')}
                </Toggle>
                <Toggle checked={b.accent} onChange={(accent) => setB({ ...b, accent })}>
                  {f('accent')}
                </Toggle>
              </div>
            </>
          )}
        />
      )}

      {parts.has('table') && <TableFields doc={doc} set={set} onFocus={onFocus} />}

      {parts.has('svg') && (
        <Row label={f('svg')} hint={<span className="normal-case">{t('editor.svgHint')}</span>}>
          <Area path="svg" value={doc.svg ?? ''} onChange={(svg) => set({ svg })} onFocus={onFocus} label={f('svg')} mono rows={4} />
        </Row>
      )}

      {parts.has('figure') && (
        <section>
          <SectionLabel>{f('figure')}</SectionLabel>
          <div className="space-y-1.5">
            <PictureField path="figure.image" value={doc.figure?.image ?? ''} onChange={(image) => set({ figure: { ...(doc.figure ?? { image: '', alt: '', caption: '' }), image } })} onFocus={onFocus} scope={scope} known={known} />
            {(doc.figure?.image || doc.layout === 'model') && doc.layout !== 'model' && <Text path="figure.alt" value={doc.figure?.alt ?? ''} onChange={(alt) => set({ figure: { ...(doc.figure ?? { image: '', alt: '', caption: '' }), alt } })} onFocus={onFocus} placeholder={f('alt')} label={f('alt')} />}
            {doc.layout !== 'title' && doc.layout !== 'break' && <Text path="figure.caption" value={doc.figure?.caption ?? ''} onChange={(caption) => set({ figure: { ...(doc.figure ?? { image: '', alt: '', caption: '' }), caption } })} onFocus={onFocus} placeholder={f('caption')} label={f('caption')} />}
          </div>
        </section>
      )}

      {parts.has('glyph') && (
        <section>
          <SectionLabel>{f('glyph')}</SectionLabel>
          <div className="grid grid-cols-[72px_1fr] gap-1.5">
            <Text path="glyph" value={doc.glyph?.char ?? ''} onChange={(char) => set({ glyph: { caption: doc.glyph?.caption ?? '', char } })} onFocus={onFocus} placeholder="道" label={f('glyphChar')} className="text-center text-[18px]" />
            <Text path="glyph.caption" value={doc.glyph?.caption ?? ''} onChange={(caption) => set({ glyph: { char: doc.glyph?.char ?? '', caption } })} onFocus={onFocus} placeholder={f('glyphCaption')} label={f('glyphCaption')} />
          </div>
        </section>
      )}

      {doc.raw !== undefined && (
        <section>
          <SectionLabel>{t('editor.sourceCode')}</SectionLabel>
          <p className="mb-1.5 text-[12px] leading-snug text-ink-3">{t('editor.raw')}</p>
          <Area path="raw" value={doc.raw} onChange={(raw) => set({ raw })} onFocus={onFocus} label={t('editor.sourceCode')} mono rows={6} />
        </section>
      )}

      {(parts.has('source') || doc.source !== undefined) && (
        <section>
          <SectionLabel>{t('editor.footer')}</SectionLabel>
          <Text path="source" value={doc.source ?? ''} onChange={(source) => set({ source })} onFocus={onFocus} placeholder={f('source')} label={f('source')} />
        </section>
      )}
    </div>
  )
}

const header = (doc: SlideDoc) => doc.header ?? { eyebrow: '', title: '', lead: '', tag: '' }
const text = (doc: SlideDoc) => doc.text ?? { eyebrow: '', title: '', subtitle: '', meta: '', lead: '', big: '', sub: '', until: '', body: '' }

/** The layout's options as switches and a column count. */
function Options({ spec, doc, onChange }: { spec: LayoutSpec; doc: SlideDoc; onChange: (options: SlideDoc['options']) => void }) {
  const { t } = useTranslation()
  const label = (key: string) => tr(t, `editor.o.${spec.id === 'steps' && key === 'plain' ? 'plainSteps' : key}`)
  return (
    <section>
      <SectionLabel>{t('editor.options')}</SectionLabel>
      <div className="flex flex-wrap items-center gap-1.5">
        {spec.options.map((o) =>
          o.kind === 'flag' ? (
            <Toggle key={o.key} checked={!!doc.options[o.key]} onChange={(v) => onChange(v ? { ...doc.options, [o.key]: true } : Object.fromEntries(Object.entries(doc.options).filter(([k]) => k !== o.key)))}>
              {label(o.key)}
            </Toggle>
          ) : (
            <span key={o.key} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
              {label(o.key)}
              <Segmented size="sm" value={String(doc.options[o.key] ?? o.default)} onChange={(v) => onChange({ ...doc.options, [o.key]: Number(v) })} options={o.values.map((v) => ({ value: String(v), label: String(v) }))} />
            </span>
          ),
        )}
      </div>
    </section>
  )
}

function TableFields({ doc, set, onFocus }: { doc: SlideDoc; set: (patch: Partial<SlideDoc>) => void; onFocus: (path: string) => void }) {
  const { t } = useTranslation()
  const f = (key: string, opts?: Record<string, unknown>) => tr(t, `editor.f.${key}`, opts)
  const table = doc.table ?? { head: [], rows: [] }
  const cols = Math.max(table.head.length, ...table.rows.map((r) => r.length), 1)
  const setHead = (i: number, v: string) => set({ table: { ...table, head: Array.from({ length: cols }, (_, k) => (k === i ? v : (table.head[k] ?? ''))) } })
  const setCell = (r: number, c: number, patch: Partial<{ text: string; tone: Tone }>) => set({ table: { ...table, rows: table.rows.map((row, k) => (k === r ? Array.from({ length: cols }, (_, j) => (j === c ? { ...(row[j] ?? { text: '', tone: '' }), ...patch } : (row[j] ?? { text: '', tone: '' }))) : row)) } })
  const addRow = () => set({ table: { ...table, rows: [...table.rows, Array.from({ length: cols }, () => ({ text: '', tone: '' as Tone }))] } })
  const removeRow = (r: number) => set({ table: { ...table, rows: table.rows.filter((_, k) => k !== r) } })
  const addCol = () => set({ table: { head: table.head.length ? [...table.head, ''] : table.head, rows: table.rows.map((row) => [...row, { text: '', tone: '' as Tone }]) } })
  const removeCol = () => cols > 1 && set({ table: { head: table.head.slice(0, cols - 1), rows: table.rows.map((row) => row.slice(0, cols - 1)) } })
  return (
    <section>
      <SectionLabel right={<span className="tnum">{t('editor.f.column')} {cols}</span>}>{f('table')}</SectionLabel>
      <div className="space-y-1.5" id="f-table" tabIndex={-1} onFocus={() => onFocus('table')}>
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }, (_, i) => (
            <Text key={i} path={`table.head.${i}`} value={table.head[i] ?? ''} onChange={(v) => setHead(i, v)} onFocus={onFocus} placeholder={f('head')} label={f('head')} className="font-medium" />
          ))}
        </div>
        {table.rows.map((row, r) => (
          <div key={r} className="rounded-lg border border-line bg-surface-2/50 p-1.5">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className="min-w-0 space-y-1">
                  <Area path={`table.${r}.${c}`} value={row[c]?.text ?? ''} onChange={(v) => setCell(r, c, { text: v })} onFocus={onFocus} placeholder={f('text')} label={f('row', { n: r + 1 })} />
                  <Select value={row[c]?.tone ?? ''} onChange={(e) => setCell(r, c, { tone: e.target.value as Tone })} className="h-6 w-auto px-1.5 text-[11px]" aria-label={f('tone')}>
                    <option value="">{f('toneNone')}</option>
                    <option value="good">{f('toneGood')}</option>
                    <option value="bad">{f('toneBad')}</option>
                  </Select>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => removeRow(r)} className="mt-1 text-[11px] text-ink-3 hover:text-rose">
              {t('editor.remove')}
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 text-[12px]">
          <button type="button" onClick={addRow} className="text-ink-2 hover:text-ink">
            + {f('addRow')}
          </button>
          <button type="button" onClick={addCol} className="text-ink-2 hover:text-ink">
            + {f('addColumn')}
          </button>
          {cols > 1 && (
            <button type="button" onClick={removeCol} className="text-ink-3 hover:text-rose">
              − {f('removeColumn')}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
