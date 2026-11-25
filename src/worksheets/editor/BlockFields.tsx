import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Plus, Trash2, X } from 'lucide-react'
import { LINES, newBlock, SHEET_SHAPES, SPACES, blockSummary, type BlockKind, type BlockWords, type Room, type SheetBlock, type TextItem } from '@/domain/sheetDoc'
import { normalizeSheetHtml, SHEET_BLOCKS } from '@/domain/sheets'
import type { AssetScope } from '@/api'
import { cx, IconButton } from '@/components/ui'
import Menu, { type MenuItem } from '@/components/Menu'
import { PictureField } from '@/slides/editor/PicturePicker'

/**
 * The fields of a worksheet's blocks (docs/worksheets.md, section 7): a card per block with its kind, a line of what
 * it says, its ⋯ (up, down, duplicate, remove) and, opened, the fields of its kind. Changes go to the sheet at once;
 * `field` names what was typed in, so typing in one field is one step of the editor's history.
 */

export type Change = (fn: (b: SheetBlock) => void, field?: string) => void

/** The modifiers of a block that are a choice among several, shown as one select; the rest are switches. */
const CHOICES: Partial<Record<BlockKind, string[][]>> = {
  grid: [['g-2', 'g-3', 'g-2x2', 'g-wide']],
  pair: [['', 'r-2-1', 'r-1-2', 'r-3-2']],
  picture: [['', 'left', 'right']],
  columns: [['', 'cols-3']],
  question: [['', 'pitch-l', 'pitch-xl']],
  ticks: [['', 'pitch-l']],
}
/** Kinds whose writing room is lines (and space); kinds with a height; kinds that can take the rest of the page. */
const HAS_LINES: BlockKind[] = ['question', 'write']
const HAS_SPACE: BlockKind[] = ['question', 'write', 'box', 'grid', 'circle', 'picture', 'pictures', 'table', 'rows', 'criteria', 'matrix', 'timeline', 'shape', 'cards', 'certificate', 'figure', 'placemat']
const NO_FILL: BlockKind[] = ['raw', 'picture', 'pictures', 'ticks', 'table', 'facts', 'starters', 'scale', 'selftest', 'ifthen', 'note', 'certificate', 'placemat']

const ADDABLE = SHEET_BLOCKS.map((b) => b.block) as Exclude<BlockKind, 'raw'>[]

/** A translation whose key is put together (a kind, a modifier): the keys exist, the type cannot see them. */
const tt = (t: (k: never) => unknown, key: string): string => String(t(key as never))

const field = 'field h-8 w-full px-2 text-[13px]'
const area = 'field w-full px-2 py-1.5 text-[13px] leading-snug'

function Text({ label, value, onChange, onBlur, multiline, placeholder, id }: { label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; multiline?: boolean; placeholder?: string; id?: string }) {
  return (
    <label className="block min-w-0 flex-1">
      <span className="mb-0.5 block text-[11px] text-ink-3">{label}</span>
      {multiline ? <textarea id={id} rows={Math.min(8, Math.max(2, value.split('\n').length + 1))} className={area} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} /> : <input id={id} className={field} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />}
    </label>
  )
}

/**
 * A field whose text is read into something else (cells, split at the bars and trimmed): while it is typed in it
 * shows what was typed, so a space at the end of a cell or a bar just set stays; left, it shows what was stored.
 */
function Cells({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const [typed, setTyped] = useState<string | null>(null)
  return <Text label={label} multiline={multiline} value={typed ?? value} onChange={(v) => (setTyped(v), onChange(v))} onBlur={() => setTyped(null)} />
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] text-ink-3">{label}</span>
      <select className="field h-8 w-auto pr-7 text-[13px]" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/** A list with a row per entry: move up, down, remove; and add. */
function List<T>({ items, onChange, render, make, addLabel, max = 60 }: { items: T[]; onChange: (next: T[]) => void; render: (item: T, i: number, set: (v: T) => void) => ReactNode; make: () => T; addLabel: string; max?: number }) {
  const { t } = useTranslation()
  const move = (i: number, d: number) => {
    const next = [...items]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-1 rounded-md border border-line p-2">
          <div className="min-w-0 flex-1 space-y-1.5">{render(it, i, (v) => onChange(items.map((x, k) => (k === i ? v : x))))}</div>
          <div className="flex shrink-0 flex-col">
            <IconButton label={t('sheetEditor.up')} onClick={() => i > 0 && move(i, -1)}>
              <ArrowUp size={13} />
            </IconButton>
            <IconButton label={t('sheetEditor.down')} onClick={() => i < items.length - 1 && move(i, 1)}>
              <ArrowDown size={13} />
            </IconButton>
            <IconButton label={t('sheetEditor.removeEntry')} onClick={() => onChange(items.filter((_, k) => k !== i))}>
              <X size={13} />
            </IconButton>
          </div>
        </div>
      ))}
      {items.length < max && (
        <button type="button" className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-ink-2 hover:bg-surface-2" onClick={() => onChange([...items, make()])}>
          <Plus size={12} />
          {addLabel}
        </button>
      )}
    </div>
  )
}

/** The kinds of a text item: a heading, a paragraph of some class, or a list. */
const ITEM_KINDS: { key: string; tag: TextItem['tag']; cls: string }[] = [
  { key: 'h2', tag: 'h2', cls: '' },
  { key: 'h3', tag: 'h3', cls: '' },
  { key: 'p', tag: 'p', cls: '' },
  { key: 'hint', tag: 'p', cls: 'hint' },
  { key: 'prompt', tag: 'p', cls: 'prompt' },
  { key: 'promptQuiet', tag: 'p', cls: 'prompt quiet' },
  { key: 'quiet', tag: 'p', cls: 'quiet' },
  { key: 'fillIn', tag: 'p', cls: 'fill-in' },
  { key: 'small', tag: 'p', cls: 'small' },
  { key: 'big', tag: 'p', cls: 'big' },
  { key: 'line', tag: 'p', cls: 'line' },
  { key: 'ul', tag: 'ul', cls: '' },
  { key: 'ol', tag: 'ol', cls: '' },
]

function Items({ items, onChange, field: f }: { items: TextItem[]; onChange: (next: TextItem[]) => void; field: string }) {
  const { t } = useTranslation()
  return (
    <List
      items={items}
      onChange={onChange}
      addLabel={t('sheetEditor.addText')}
      make={(): TextItem => ({ tag: 'p', cls: '', text: '', points: [] })}
      render={(it, i, set) => {
        const kind = ITEM_KINDS.find((k) => k.tag === it.tag && k.cls === it.cls)
        const options = ITEM_KINDS.map((k) => ({ value: k.key, label: tt(t, `sheetEditor.item.${k.key}`) }))
        if (!kind) options.push({ value: '?', label: `${it.tag}.${it.cls}` })
        const list = it.tag === 'ul' || it.tag === 'ol'
        return (
          <>
            <Select
              label={t('sheetEditor.itemKind')}
              value={kind?.key ?? '?'}
              options={options}
              onChange={(v) => {
                const k = ITEM_KINDS.find((x) => x.key === v)!
                const toList = k.tag === 'ul' || k.tag === 'ol'
                set({ tag: k.tag, cls: k.cls, text: toList ? '' : list ? it.points.join(' ') : it.text, points: toList ? (list ? it.points : it.text ? [it.text] : ['']) : [] })
              }}
            />
            {list ? (
              <Text label={t('sheetEditor.points')} multiline value={it.points.join('\n')} onChange={(v) => set({ ...it, points: v.split('\n') })} id={`${f}.${i}`} />
            ) : (
              <Text label={t('sheetEditor.text')} multiline={it.tag === 'p'} value={it.text} onChange={(v) => set({ ...it, text: v })} id={`${f}.${i}`} />
            )}
          </>
        )
      }}
    />
  )
}

function RoomFields({ room, onChange }: { room: Room | null; onChange: (r: Room | null) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-3">
      <Select label={t('sheetEditor.roomLines')} value={String(room?.lines ?? 0)} options={[{ value: '0', label: '–' }, ...LINES.map((n) => ({ value: String(n), label: t('sheetEditor.lines', { count: n }) }))]} onChange={(v) => onChange(Number(v) || room?.space ? { lines: Number(v), space: room?.space ?? 0 } : null)} />
      <Select label={t('sheetEditor.roomSpace')} value={String(room?.space ?? 0)} options={[{ value: '0', label: '–' }, ...SPACES.map((n) => ({ value: String(n), label: `${n} mm` }))]} onChange={(v) => onChange(Number(v) || room?.lines ? { lines: room?.lines ?? 0, space: Number(v) } : null)} />
    </div>
  )
}

/** The modifiers, height, lines and fill of a block. */
function Shape({ b, change }: { b: SheetBlock; change: Change }) {
  const { t } = useTranslation()
  const choices = CHOICES[b.kind] ?? []
  const inChoice = new Set(choices.flat())
  // a shape's form is a field of its own
  const switches = b.kind === 'shape' ? [] : (SHEET_BLOCKS.find((x) => x.block === b.kind)?.modifiers ?? []).filter((m) => !inChoice.has(m))
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      {choices.map((set, k) => (
        <Select
          key={k}
          label={tt(t, `sheetEditor.choice.${b.kind}`)}
          value={set.find((m) => m && b.mods.includes(m)) ?? set[0]}
          options={set.map((m) => ({ value: m, label: tt(t, `sheetEditor.mod.${m || `${b.kind}Default`}`) }))}
          onChange={(v) => change((x) => void (x.mods = [...x.mods.filter((m) => !set.includes(m)), ...(v ? [v] : [])]))}
        />
      ))}
      {HAS_LINES.includes(b.kind) && <Select label={t('sheetEditor.roomLines')} value={String(b.lines)} options={[{ value: '0', label: '–' }, ...LINES.map((n) => ({ value: String(n), label: t('sheetEditor.lines', { count: n }) }))]} onChange={(v) => change((x) => void (x.lines = Number(v)))} />}
      {HAS_SPACE.includes(b.kind) && <Select label={b.kind === 'question' || b.kind === 'write' ? t('sheetEditor.roomSpace') : t('sheetEditor.height')} value={String(b.space)} options={[{ value: '0', label: '–' }, ...SPACES.map((n) => ({ value: String(n), label: `${n} mm` }))]} onChange={(v) => change((x) => void (x.space = Number(v)))} />}
      {!NO_FILL.includes(b.kind) && <Check label={t('sheetEditor.fill')} checked={b.fill} onChange={(v) => change((x) => void (x.fill = v))} />}
      {switches.map((m) => (
        <Check key={m} label={tt(t, `sheetEditor.mod.${m}`)} checked={b.mods.includes(m)} onChange={(v) => change((x) => void (x.mods = v ? [...x.mods, m] : x.mods.filter((y) => y !== m)))} />
      ))}
    </div>
  )
}

/** The fields of a block's content, by its kind. */
function Content({ b, change, scope, theme, words, path }: { b: SheetBlock; change: Change; scope: AssetScope; theme: string; words: BlockWords; path: string }) {
  const { t } = useTranslation()
  switch (b.kind) {
    case 'text':
    case 'box':
      return <Items items={b.items} field={path} onChange={(items) => change((x) => void ((x as typeof b).items = items), `${path}.items`)} />
    case 'terms':
      return <List items={b.entries} addLabel={t('sheetEditor.addEntry')} make={() => ({ term: '', text: '' })} onChange={(entries) => change((x) => void ((x as typeof b).entries = entries), `${path}.entries`)} render={(e, _i, s) => (<><Text label={t('sheetEditor.term')} value={e.term} onChange={(v) => s({ ...e, term: v })} /><Text label={t('sheetEditor.explanation')} multiline value={e.text} onChange={(v) => s({ ...e, text: v })} /></>)} />
    case 'columns':
      return <List items={b.sections} addLabel={t('sheetEditor.addSection')} make={() => ({ heading: '', items: [''] })} onChange={(sections) => change((x) => void ((x as typeof b).sections = sections), `${path}.sections`)} render={(s, _i, put) => (<><Text label={t('sheetEditor.heading')} value={s.heading} onChange={(v) => put({ ...s, heading: v })} /><Text label={t('sheetEditor.points')} multiline value={s.items.join('\n')} onChange={(v) => put({ ...s, items: v.split('\n') })} /></>)} />
    case 'table':
      return (
        <div className="space-y-2">
          <Cells label={t('sheetEditor.tableHead')} value={b.head.join(' | ')} onChange={(v) => change((x) => void ((x as typeof b).head = v ? v.split('|').map((c) => c.trim()) : []), `${path}.head`)} />
          <Cells label={t('sheetEditor.tableRows')} multiline value={b.rows.map((r) => r.join(' | ')).join('\n')} onChange={(v) => change((x) => void ((x as typeof b).rows = v.split('\n').map((r) => r.split('|').map((c) => c.trim()))), `${path}.rows`)} />
          <p className="text-[11px] text-ink-3">{t('sheetEditor.tableHint')}</p>
        </div>
      )
    case 'steps':
      return (
        <List
          items={b.steps}
          addLabel={t('sheetEditor.addStep')}
          make={() => ({ title: '', time: '', body: [], room: null })}
          onChange={(steps) => change((x) => void ((x as typeof b).steps = steps), `${path}.steps`)}
          render={(s, i, put) => (
            <>
              <div className="flex gap-2">
                <Text label={t('sheetEditor.stepTitle')} value={s.title} onChange={(v) => put({ ...s, title: v })} />
                <div className="w-24">
                  <Text label={t('sheetEditor.time')} value={s.time} onChange={(v) => put({ ...s, time: v })} />
                </div>
              </div>
              <Items items={s.body} field={`${path}.steps.${i}`} onChange={(body) => put({ ...s, body })} />
              <RoomFields room={s.room} onChange={(room) => put({ ...s, room })} />
            </>
          )}
        />
      )
    case 'question':
      return (
        <div className="space-y-2">
          <Text label={t('sheetEditor.question')} value={b.title} onChange={(v) => change((x) => void ((x as typeof b).title = v), `${path}.title`)} />
          <Text label={t('sheetEditor.hint')} value={b.hint} onChange={(v) => change((x) => void ((x as typeof b).hint = v), `${path}.hint`)} />
          <Check label={t('sheetEditor.plainTitle')} checked={b.plain} onChange={(v) => change((x) => void ((x as typeof b).plain = v))} />
        </div>
      )
    case 'grid':
      return (
        <List
          items={b.fields}
          addLabel={t('sheetEditor.addField')}
          make={() => ({ mods: [] as string[], items: [{ tag: 'p', cls: 'prompt', text: '', points: [] } as TextItem] })}
          onChange={(fields) => change((x) => void ((x as typeof b).fields = fields), `${path}.fields`)}
          render={(f, i, put) => (
            <>
              <Items items={f.items} field={`${path}.fields.${i}`} onChange={(items) => put({ ...f, items })} />
              <div className="flex flex-wrap gap-3">
                {['center', 'big', 'thick'].map((m) => (
                  <Check key={m} label={tt(t, `sheetEditor.mod.${m}`)} checked={f.mods.includes(m)} onChange={(v) => put({ ...f, mods: v ? [...f.mods, m] : f.mods.filter((y) => y !== m) })} />
                ))}
              </div>
            </>
          )}
        />
      )
    case 'rows':
      return (
        <List
          items={b.rows}
          addLabel={t('sheetEditor.addRow')}
          make={() => ({ label: '', items: [{ tag: 'p', cls: 'prompt', text: '', points: [] } as TextItem], room: null, space: 0 })}
          onChange={(rows) => change((x) => void ((x as typeof b).rows = rows), `${path}.rows`)}
          render={(r, i, put) => (
            <>
              <Text label={t('sheetEditor.label')} value={r.label} onChange={(v) => put({ ...r, label: v })} />
              <Items items={r.items} field={`${path}.rows.${i}`} onChange={(items) => put({ ...r, items })} />
              <div className="flex flex-wrap gap-3">
                <Select label={t('sheetEditor.height')} value={String(r.space)} options={[{ value: '0', label: '–' }, ...SPACES.map((n) => ({ value: String(n), label: `${n} mm` }))]} onChange={(v) => put({ ...r, space: Number(v) })} />
              </div>
            </>
          )}
        />
      )
    case 'circle':
      return (
        <div className="space-y-2">
          <Select label={t('sheetEditor.segments')} value={String(b.segments.length || 4)} options={Array.from({ length: 11 }, (_, k) => ({ value: String(k + 2), label: String(k + 2) }))} onChange={(v) => change((x) => void ((x as typeof b).segments = Array.from({ length: Number(v) }, (_, k) => (x as typeof b).segments[k] ?? '')))} />
          <Text label={t('sheetEditor.middle')} value={b.middle} placeholder={t('sheetEditor.middleHint')} onChange={(v) => change((x) => void ((x as typeof b).middle = v), `${path}.middle`)} />
        </div>
      )
    case 'criteria':
      return (
        <List
          items={b.crits}
          addLabel={t('sheetEditor.addCriterion')}
          make={() => ({ label: words.rating, score: '/10', name: '', notes: [words.note, words.note], space: 0 })}
          onChange={(crits) => change((x) => void ((x as typeof b).crits = crits), `${path}.crits`)}
          render={(c, _i, put) => (
            <>
              <Text label={t('sheetEditor.criterion')} value={c.name} onChange={(v) => put({ ...c, name: v })} />
              <div className="flex gap-2">
                <Text label={t('sheetEditor.ratingLabel')} value={c.label} onChange={(v) => put({ ...c, label: v })} />
                <div className="w-20">
                  <Text label={t('sheetEditor.scale')} value={c.score} onChange={(v) => put({ ...c, score: v })} />
                </div>
              </div>
              <Text label={t('sheetEditor.notes')} multiline value={c.notes.join('\n')} onChange={(v) => put({ ...c, notes: v.split('\n') })} />
            </>
          )}
        />
      )
    case 'ticks':
      return (
        <div className="space-y-2">
          <Select label={t('sheetEditor.tickCount')} value={String(b.items.length)} options={Array.from({ length: 15 }, (_, k) => ({ value: String(k + 1), label: String(k + 1) }))} onChange={(v) => change((x) => void ((x as typeof b).items = Array.from({ length: Number(v) }, (_, k) => (x as typeof b).items[k] ?? '')))} />
          <Text label={t('sheetEditor.tickTexts')} multiline value={b.items.join('\n')} onChange={(v) => change((x) => void ((x as typeof b).items = v.split('\n')), `${path}.items`)} />
        </div>
      )
    case 'write':
      return null
    case 'picture':
      return (
        <div className="space-y-2">
          <PictureField path={`${path}.image`} value={b.image.replace(/^asset:/, '')} onChange={(hash) => change((x) => void ((x as typeof b).image = hash ? `asset:${hash}` : ''))} onFocus={() => undefined} scope={scope} known={[]} theme={theme} prefer="illustration" />
          <Text label={t('sheetEditor.caption')} value={b.caption} onChange={(v) => change((x) => void ((x as typeof b).caption = v), `${path}.caption`)} />
        </div>
      )
    case 'pictures':
      return (
        <List
          items={b.items}
          addLabel={t('sheetEditor.addPicture')}
          make={() => ({ image: '', alt: '', caption: '' })}
          onChange={(items) => change((x) => void ((x as typeof b).items = items), `${path}.items`)}
          render={(p, i, put) => (
            <>
              <PictureField path={`${path}.items.${i}`} value={p.image.replace(/^asset:/, '')} onChange={(hash) => put({ ...p, image: hash ? `asset:${hash}` : '' })} onFocus={() => undefined} scope={scope} known={[]} theme={theme} prefer="illustration" />
              <Text label={t('sheetEditor.caption')} value={p.caption} onChange={(v) => put({ ...p, caption: v })} />
            </>
          )}
        />
      )
    case 'pair':
      return (
        <div className="grid gap-3">
          {[0, 1].map((col) => (
            <div key={col} className="rounded-md border border-dashed border-line p-2">
              <div className="mb-1.5 text-[12px] font-semibold text-brand-ink">{t(col === 0 ? 'sheetEditor.leftColumn' : 'sheetEditor.rightColumn')}</div>
              <Blocks blocks={b.columns[col]} onChange={(next, f) => change((x) => void ((x as typeof b).columns[col] = next), f)} scope={scope} theme={theme} words={words} path={`${path}.col${col}`} nested />
            </div>
          ))}
        </div>
      )
    case 'raw':
      return <RawField html={b.html} onApply={(html) => change((x) => void ((x as typeof b).html = html))} />
    case 'note':
      return <Items items={b.items} field={path} onChange={(items) => change((x) => void ((x as typeof b).items = items), `${path}.items`)} />
    case 'facts':
      return <p className="text-[12px] text-ink-3">{t('sheetEditor.factsHint')}</p>
    case 'starters':
      return (
        <div className="space-y-2">
          <Text label={t('sheetEditor.starters')} multiline value={b.items.join('\n')} onChange={(v) => change((x) => void ((x as typeof b).items = v.split('\n')), `${path}.items`)} />
          <Select label={t('sheetEditor.roomLines')} value={String(b.lines || 1)} options={LINES.slice(0, 6).map((n) => ({ value: String(n), label: t('sheetEditor.lines', { count: n }) }))} onChange={(v) => change((x) => void (x.lines = Number(v) > 1 ? Number(v) : 0))} />
        </div>
      )
    case 'matrix':
      return (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Text label={t('sheetEditor.axisY')} value={b.y} onChange={(v) => change((x) => void ((x as typeof b).y = v), `${path}.y`)} />
            <Text label={t('sheetEditor.axisX')} value={b.x} onChange={(v) => change((x) => void ((x as typeof b).x = v), `${path}.x`)} />
          </div>
          {b.fields.map((f, i) => (
            <div key={i} className="rounded-md border border-line p-2">
              <div className="mb-1 text-[11px] text-ink-3">{tt(t, `sheetEditor.quarter.${i}`)}</div>
              <Items items={f} field={`${path}.fields.${i}`} onChange={(items) => change((x) => void ((x as typeof b).fields[i] = items), `${path}.fields.${i}`)} />
            </div>
          ))}
        </div>
      )
    case 'timeline':
      return <Text label={t('sheetEditor.timelineMarks')} multiline value={b.items.join('\n')} onChange={(v) => change((x) => void ((x as typeof b).items = v.split('\n')), `${path}.items`)} />
    case 'shape':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3">
            <Select label={t('sheetEditor.form')} value={b.form} options={SHEET_SHAPES.map((f) => ({ value: f, label: tt(t, `slides.shape.${f}`) }))} onChange={(v) => change((x) => void ((x as typeof b).form = v as typeof b.form))} />
            <Select label={t('sheetEditor.segments')} value={String(b.entries.length || 3)} options={Array.from({ length: 5 }, (_, k) => ({ value: String(k + 2), label: String(k + 2) }))} onChange={(v) => change((x) => void ((x as typeof b).entries = Array.from({ length: Number(v) }, (_, k) => (x as typeof b).entries[k] ?? '')))} />
          </div>
          <Text label={t('sheetEditor.shapeEntries')} multiline value={b.entries.join('\n')} onChange={(v) => change((x) => void ((x as typeof b).entries = v.split('\n')), `${path}.entries`)} />
        </div>
      )
    case 'scale':
      return (
        <List
          items={b.rows}
          addLabel={t('sheetEditor.addScale')}
          make={() => ({ label: '', low: words.low, high: words.high })}
          onChange={(rows) => change((x) => void ((x as typeof b).rows = rows), `${path}.rows`)}
          render={(r, _i, put) => (
            <>
              <Text label={t('sheetEditor.scaleLabel')} value={r.label} onChange={(v) => put({ ...r, label: v })} />
              <div className="flex gap-2">
                <Text label={t('sheetEditor.low')} value={r.low} onChange={(v) => put({ ...r, low: v })} />
                <Text label={t('sheetEditor.high')} value={r.high} onChange={(v) => put({ ...r, high: v })} />
              </div>
            </>
          )}
        />
      )
    case 'selftest':
      return (
        <div className="space-y-2">
          <Cells label={t('sheetEditor.answers')} value={b.head.join(' | ')} onChange={(v) => change((x) => void ((x as typeof b).head = v.split('|').map((c) => c.trim()).slice(0, 6)), `${path}.head`)} />
          <Text label={t('sheetEditor.statements')} multiline value={b.items.join('\n')} onChange={(v) => change((x) => void ((x as typeof b).items = v.split('\n')), `${path}.items`)} />
          <Text label={t('sheetEditor.sum')} value={b.sum} onChange={(v) => change((x) => void ((x as typeof b).sum = v), `${path}.sum`)} />
        </div>
      )
    case 'cards':
      return (
        <List
          items={b.cards}
          addLabel={t('sheetEditor.addCard')}
          make={(): TextItem[] => [{ tag: 'p', cls: 'big', text: '', points: [] }]}
          onChange={(cards) => change((x) => void ((x as typeof b).cards = cards), `${path}.cards`)}
          render={(card, i, put) => <Items items={card} field={`${path}.cards.${i}`} onChange={put} />}
        />
      )
    case 'certificate':
      return (
        <div className="space-y-2">
          <div className="text-[11px] text-ink-3">{t('sheetEditor.certItems')}</div>
          <Items items={b.items} field={`${path}.items`} onChange={(items) => change((x) => void ((x as typeof b).items = items), `${path}.items`)} />
          <RoomFields room={b.room} onChange={(room) => change((x) => void ((x as typeof b).room = room))} />
          <div className="text-[11px] text-ink-3">{t('sheetEditor.stamp')}</div>
          <PictureField path={`${path}.stamp`} value={b.stamp.replace(/^asset:/, '')} onChange={(hash) => change((x) => void ((x as typeof b).stamp = hash ? `asset:${hash}` : ''))} onFocus={() => undefined} scope={scope} known={[]} theme={theme} prefer="illustration" />
        </div>
      )
    case 'figure':
      return (
        <div className="space-y-2">
          <PictureField path={`${path}.image`} value={b.image.replace(/^asset:/, '')} onChange={(hash) => change((x) => void ((x as typeof b).image = hash ? `asset:${hash}` : ''))} onFocus={() => undefined} scope={scope} known={[]} theme={theme} prefer="illustration" />
          <Text label={t('sheetEditor.caption')} multiline value={b.caption} onChange={(v) => change((x) => void ((x as typeof b).caption = v), `${path}.caption`)} />
          <div className="text-[11px] text-ink-3">{t('sheetEditor.fieldsAround')}</div>
          <List
            items={b.fields}
            addLabel={t('sheetEditor.addField')}
            make={(): TextItem[] => [{ tag: 'p', cls: 'prompt', text: '', points: [] }]}
            onChange={(fields) => change((x) => void ((x as typeof b).fields = fields), `${path}.fields`)}
            render={(f, i, put) => <Items items={f} field={`${path}.fields.${i}`} onChange={put} />}
          />
        </div>
      )
    case 'placemat':
      return (
        <div className="space-y-2">
          <div className="rounded-md border border-line p-2">
            <div className="mb-1 text-[11px] text-ink-3">{t('sheetEditor.middleField')}</div>
            <Items items={b.middle} field={`${path}.middle`} onChange={(items) => change((x) => void ((x as typeof b).middle = items), `${path}.middle`)} />
          </div>
          {b.seats.map((seat, i) => (
            <div key={i} className="rounded-md border border-line p-2">
              <div className="mb-1 text-[11px] text-ink-3">{t('sheetEditor.seat', { n: i + 1 })}</div>
              <Items items={seat} field={`${path}.seats.${i}`} onChange={(items) => change((x) => void ((x as typeof b).seats[i] = items), `${path}.seats.${i}`)} />
            </div>
          ))}
        </div>
      )
    case 'ifthen':
      return (
        <List
          items={b.plans}
          addLabel={t('sheetEditor.addPlan')}
          make={() => ({ if: words.when, then: words.then })}
          onChange={(plans) => change((x) => void ((x as typeof b).plans = plans), `${path}.plans`)}
          render={(pl, _i, put) => (
            <div className="flex gap-2">
              <Text label={t('sheetEditor.if')} value={pl.if} onChange={(v) => put({ ...pl, if: v })} />
              <Text label={t('sheetEditor.then')} value={pl.then} onChange={(v) => put({ ...pl, then: v })} />
            </div>
          )}
        />
      )
  }
}

/**
 * A block kept as source: its markup, applied when the field is left. The field follows its block: when the markup
 * changes from outside (undo, a block removed or moved before it) the field shows that, never what it held before.
 */
function RawField({ html, onApply }: { html: string; onApply: (html: string) => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(html)
  const [from, setFrom] = useState(html)
  if (from !== html) {
    setFrom(html)
    setText(html)
  }
  return (
    <div>
      <p className="mb-1 text-[12px] text-ink-3">{t('sheetEditor.rawHint')}</p>
      <textarea
        className={cx(area, 'font-mono text-[12px]')}
        rows={Math.min(14, text.split('\n').length + 2)}
        spellCheck={false}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          // a block stays one element of the page: what the sanitiser keeps of it
          const clean = normalizeSheetHtml(`<section class="sheet">${text}</section>`).replace(/^<section class="sheet">|<\/section>$/g, '')
          if (clean !== html) onApply(clean)
        }}
      />
    </div>
  )
}

/** A block's card: its kind and what it says, ⋯, and its fields when open; a red line when it runs over the page. */
function BlockCard({ b, i, count, change, onMove, onDuplicate, onRemove, scope, theme, words, path, over, open, onToggle }: { b: SheetBlock; i: number; count: number; change: Change; onMove: (d: number) => void; onDuplicate: () => void; onRemove: () => void; scope: AssetScope; theme: string; words: BlockWords; path: string; over?: number; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const items: MenuItem[] = [
    { label: t('sheetEditor.up'), icon: <ArrowUp size={14} />, disabled: i === 0, onSelect: () => onMove(-1) },
    { label: t('sheetEditor.down'), icon: <ArrowDown size={14} />, disabled: i === count - 1, onSelect: () => onMove(1) },
    { label: t('sheetEditor.duplicateBlock'), icon: <Copy size={14} />, onSelect: onDuplicate },
    { label: t('sheetEditor.removeBlock'), icon: <Trash2 size={14} />, danger: true, separated: true, onSelect: onRemove },
  ]
  return (
    <div id={`sheet-block-${path}`} className={cx('rounded-lg border bg-surface', over ? 'border-rose' : 'border-line')}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={onToggle} aria-expanded={open}>
          {open ? <ChevronDown size={14} className="shrink-0 text-ink-3" /> : <ChevronRight size={14} className="shrink-0 text-ink-3" />}
          <span className="shrink-0 text-[13px] font-medium">{tt(t, `sheetEditor.kind.${b.kind}`)}</span>
          <span className="truncate text-[12px] text-ink-3">{blockSummary(b)}</span>
        </button>
        <Menu items={items} label={t('sheetEditor.blockActions')} float />
      </div>
      {over ? <p className="px-3 pb-1 text-[12px] text-rose">{t('sheetEditor.over', { mm: over.toFixed(0) })}</p> : null}
      {open && (
        <div className="space-y-3 border-t border-line px-3 py-3">
          {b.kind !== 'raw' && <Shape b={b} change={change} />}
          <Content b={b} change={change} scope={scope} theme={theme} words={words} path={path} />
        </div>
      )}
    </div>
  )
}

/** The blocks of a page (or of a column of two): their cards and the menu to add one. */
export function Blocks({ blocks, onChange, scope, theme, words, path, nested, overflow = {}, focus }: { blocks: SheetBlock[]; onChange: (next: SheetBlock[], field?: string) => void; scope: AssetScope; theme: string; words: BlockWords; path: string; nested?: boolean; overflow?: Record<number, number>; focus?: number | null }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<Set<number>>(() => new Set())
  const shown = (i: number) => open.has(i) || focus === i
  const toggle = (i: number) => setOpen((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])))
  /** The open cards after blocks moved: `to` says where the card at an index is now (null: gone). */
  const reopen = (to: (i: number) => number | null) => setOpen((s) => new Set([...s].map(to).filter((x): x is number => x !== null)))
  const addable = nested ? ADDABLE.filter((k) => k !== 'pair') : ADDABLE
  const groups = ['read', 'instruct', 'write', 'order', 'rate', 'plan', 'picture', 'page'] as const
  const addItems: MenuItem[] = groups.flatMap((g, gi) =>
    SHEET_BLOCKS.filter((d) => d.group === g && addable.includes(d.block as Exclude<BlockKind, 'raw'>)).map((d, k) => ({
      label: tt(t, `sheetEditor.kind.${d.block}`),
      hint: tt(t, `sheetEditor.use.${d.block}`),
      separated: k === 0 && gi > 0,
      onSelect: () => {
        onChange([...blocks, newBlock(d.block as Exclude<BlockKind, 'raw'>, words)])
        setOpen((s) => new Set([...s, blocks.length]))
      },
    })),
  )
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => (
        <BlockCard
          key={i}
          b={b}
          i={i}
          count={blocks.length}
          path={`${path}.${i}`}
          over={overflow[i]}
          open={shown(i)}
          onToggle={() => toggle(i)}
          scope={scope}
          theme={theme}
          words={words}
          change={(fn, f) => {
            const next = structuredClone(blocks)
            fn(next[i])
            onChange(next, f)
          }}
          onMove={(d) => {
            const next = [...blocks]
            ;[next[i], next[i + d]] = [next[i + d], next[i]]
            onChange(next)
            reopen((k) => (k === i ? i + d : k === i + d ? i : k))
          }}
          onDuplicate={() => {
            onChange([...blocks.slice(0, i + 1), structuredClone(b), ...blocks.slice(i + 1)])
            reopen((k) => (k > i ? k + 1 : k))
          }}
          onRemove={() => {
            onChange(blocks.filter((_, k) => k !== i))
            reopen((k) => (k === i ? null : k > i ? k - 1 : k))
          }}
        />
      ))}
      <Menu
        items={addItems}
        label={t('sheetEditor.addBlock')}
        title={t('sheetEditor.addBlock')}
        align="left"
        float
        triggerClassName="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2"
        trigger={
          <>
            <Plus size={13} />
            {t('sheetEditor.addBlock')}
          </>
        }
      />
    </div>
  )
}
