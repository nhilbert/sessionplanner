import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { api, assetUrl } from '@/api'
import { POOL_KINDS, type PoolAsset, type PoolKind } from '@/domain/theme'
import { matchesTags } from '@/domain/pool'
import { usePool, useThemes } from '@/store/useThemes'
import { Button, cx } from '@/components/ui'
import Menu from '@/components/Menu'
import { uploadProblem } from '@/planner/upload'

/**
 * The picture pool of a theme (docs/slides.md, section 4): its photos, its illustrations and its icons, each with the
 * words it is found by. The three are lists of their own because they do different work (`domain/pool.ts`): a place
 * that crops its picture takes a photo, one that shows it whole an illustration. A picture filed in the wrong list is
 * moved through its menu. Shown on the pictures page and in the theme editor.
 */
const LABELS = {
  picture: { title: 'themes.pictures', hint: 'themes.picturesHint', upload: 'themes.uploadPictures', move: 'themes.moveToPictures' },
  illustration: { title: 'themes.illustrations', hint: 'themes.illustrationsHint', upload: 'themes.uploadIllustrations', move: 'themes.moveToIllustrations' },
  icon: { title: 'themes.icons', hint: 'themes.iconsHint', upload: 'themes.uploadIcons', move: 'themes.moveToIcons' },
} as const satisfies Record<PoolKind, Record<string, string>>

export function PoolEditor({ themeId, large }: { themeId: string; large?: boolean }) {
  const pool = usePool(themeId)
  const setPool = useThemes((s) => s.setPool)
  const load = useThemes((s) => s.load)
  const replace = (next: PoolAsset[]) => setPool(themeId, next)
  return (
    <div className={cx('grid gap-5', large ? 'gap-8' : 'md:grid-cols-2')}>
      {POOL_KINDS.map((kind) => (
        <PoolKindList
          key={kind}
          kind={kind}
          large={large}
          entries={pool.filter((e) => e.kind === kind)}
          onUpload={async (files) => {
            let next = pool
            for (const f of files) {
              const entry = await api.uploadPoolAsset(themeId, f, kind)
              next = [...next.filter((e) => e.hash !== entry.hash), entry]
              replace(next)
            }
            // The theme's version moved: lists elsewhere learn of the new pool.
            void load(true)
          }}
          onTags={async (hash, tags) => {
            const entry = await api.updatePoolAsset(themeId, hash, { tags })
            replace(pool.map((e) => (e.hash === hash ? entry : e)))
          }}
          onMove={async (hash, to) => {
            const entry = await api.updatePoolAsset(themeId, hash, { kind: to })
            replace(pool.map((e) => (e.hash === hash ? entry : e)))
            void load(true)
          }}
          onRemove={async (hash) => {
            await api.removePoolAsset(themeId, hash)
            replace(pool.filter((e) => e.hash !== hash))
            void load(true)
          }}
        />
      ))}
    </div>
  )
}

function PoolKindList({ kind, entries, onUpload, onTags, onMove, onRemove, large }: { kind: PoolKind; entries: PoolAsset[]; large?: boolean; onUpload: (files: File[]) => Promise<void>; onTags: (hash: string, tags: string[]) => Promise<void>; onMove: (hash: string, to: PoolKind) => Promise<void>; onRemove: (hash: string) => Promise<void> }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(kind === 'icon' ? 60 : 24)
  const sorted = [...entries].filter((e) => matchesTags(e, query)).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt))
  const page = sorted.slice(0, shown)
  const [over, setOver] = useState(false)
  const take = async (files: File[]) => {
    if (!files.length) return
    setBusy(true)
    setError('')
    try {
      await onUpload(files)
    } catch (err) {
      setError(uploadProblem(err, files[0].name, t))
    } finally {
      setBusy(false)
    }
  }
  /** A change to one entry; what went wrong is said above the list. */
  const run = (change: () => Promise<void>) => {
    setError('')
    void change().catch(() => setError(t('themes.poolFailed')))
  }
  return (
    <div
      className={cx('rounded-lg border-2 border-dashed p-3 transition-colors', over ? 'border-accent bg-accent/5' : 'border-transparent')}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) {
          e.preventDefault()
          setOver(true)
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void take([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')))
      }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12px] font-medium text-ink-2">{t(LABELS[kind].title)}</span>
        <span className="tnum text-[12px] text-ink-3">{entries.length}</span>
        <span className="flex-1" />
        <Button size="sm" onClick={() => input.current?.click()} disabled={busy}>
          <Upload size={13} />
          {busy ? t('common.uploading') : t(LABELS[kind].upload)}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])]
            e.target.value = ''
            void take(files)
          }}
        />
      </div>
      <p className="mb-2 text-[12px] leading-snug text-ink-3">{t(LABELS[kind].hint)}</p>
      {error && <p className="mb-2 text-[12px] text-rose">{error}</p>}
      {entries.length > 12 && <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('editor.searchPool')} aria-label={t('editor.searchPool')} className="field mb-2 h-8 w-full px-2 text-[13px]" />}
      {sorted.length ? (
        <ul className={cx('grid gap-2', kind === 'icon' ? (large ? 'grid-cols-5 sm:grid-cols-8 lg:grid-cols-10' : 'grid-cols-4 sm:grid-cols-5') : large ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3')}>
          {page.map((e) => (
            <PoolEntry key={e.hash} entry={e} onTags={(tags) => onTags(e.hash, tags)} onMove={(to) => run(() => onMove(e.hash, to))} onRemove={() => run(() => onRemove(e.hash))} />
          ))}
        </ul>
      ) : (
        <p className="py-4 text-center text-[13px] text-ink-3">{entries.length ? t('themes.poolNoMatch') : t('themes.poolEmpty')}</p>
      )}
      {sorted.length > page.length && (
        <div className="mt-3 flex items-center gap-3 text-[12px] text-ink-3">
          <span className="tnum">{t('themes.poolShown', { shown: page.length, total: sorted.length })}</span>
          <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + (kind === 'icon' ? 60 : 24))}>
            {t('themes.poolMore')}
          </Button>
        </div>
      )}
      <p className="mt-2 text-[11px] text-ink-3">{t('themes.dropHint')}</p>
    </div>
  )
}

function PoolEntry({ entry, onTags, onMove, onRemove }: { entry: PoolAsset; onTags: (tags: string[]) => Promise<void>; onMove: (to: PoolKind) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState(entry.tags.join(', '))
  const [base, setBase] = useState(entry.tags.join(', '))
  const joined = entry.tags.join(', ')
  if (base !== joined) {
    setBase(joined)
    setText(joined)
  }
  const commit = () => {
    const tags = [...new Set(text.split(/[,;\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))]
    if (tags.join(', ') !== joined) void onTags(tags)
  }
  return (
    <li className="group relative min-w-0">
      <div className={cx('overflow-hidden rounded-md border border-line bg-surface-2', entry.kind === 'icon' ? 'aspect-square p-2' : entry.kind === 'illustration' ? 'aspect-[4/3] p-2' : 'aspect-[4/3]')}>
        <img src={assetUrl('library', entry.hash)} alt="" className={cx('h-full w-full', entry.kind === 'picture' ? 'object-cover' : 'object-contain')} loading="lazy" />
      </div>
      <Menu
        float
        label={t('themes.poolActions')}
        className="!absolute right-1 top-1 rounded-md bg-paper/90 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100"
        items={[
          ...POOL_KINDS.filter((k) => k !== entry.kind).map((k) => ({ label: t(LABELS[k].move), onSelect: () => onMove(k) })),
          { label: t('themes.removeFromPool'), danger: true, separated: true, onSelect: onRemove },
        ]}
      />
      <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder={t('themes.tagsPlaceholder')} aria-label={t('themes.tags')} className="field mt-1 h-7 w-full px-1.5 text-[12px]" spellCheck={false} />
    </li>
  )
}
