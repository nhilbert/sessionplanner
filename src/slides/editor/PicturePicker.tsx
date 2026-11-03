import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Upload, X } from 'lucide-react'
import { api, type AssetInfo, type AssetScope, assetUrl } from '@/api'
import { Button, cx, IconButton, Modal, Segmented } from '@/components/ui'
import { fieldId } from './fields'
import { uploadProblem } from '@/planner/upload'
import { usePool } from '@/store/useThemes'
import type { PoolAsset, PoolKind } from '@/domain/theme'

/** A picture field of the slide: the thumbnail of the asset it shows, and the way to choose or remove one. */
export function PictureField({ path, value, onChange, onFocus, scope, known, label, theme, prefer = 'picture' }: { path: string; value: string; onChange: (hash: string) => void; onFocus: (path: string) => void; scope: AssetScope; known: string[]; label?: string; theme?: string; prefer?: PoolKind }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const pair = usePair(scope, value)
  return (
    <div className="flex flex-wrap items-center gap-2" id={fieldId(path)} tabIndex={-1} onFocus={() => onFocus(path)}>
      {value ? (
        <button type="button" onClick={() => setOpen(true)} className="h-12 w-20 shrink-0 overflow-hidden rounded-md border border-line bg-surface-2" aria-label={label ?? t('editor.pickPicture')}>
          <img src={assetUrl(scope, value)} alt="" className="h-full w-full object-cover" />
        </button>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Image size={13} />
          {label ?? t('editor.pickPicture')}
        </Button>
      )}
      {value && (
        <>
          <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
            {t('editor.pickPicture')}
          </Button>
          <IconButton label={t('editor.removePicture')} onClick={() => onChange('')}>
            <X size={14} />
          </IconButton>
        </>
      )}
      {pair?.cutout && (
        <Segmented size="sm" value={value === pair.cutout ? 'cutout' : 'original'} onChange={(v) => onChange(v === 'cutout' ? pair.cutout! : pair.original)} options={[{ value: 'cutout', label: t('editor.cutout') }, { value: 'original', label: t('editor.original') }]} />
      )}
      <PicturePicker open={open} onClose={() => setOpen(false)} onPick={onChange} scope={scope} known={known} current={value} theme={theme} prefer={prefer} />
    </div>
  )
}

/** The original and the cut-out an asset belongs to, asked for once per asset. */
function usePair(scope: AssetScope, hash: string): AssetInfo | null {
  const [pair, setPair] = useState<AssetInfo | null>(null)
  useEffect(() => {
    let live = true
    if (!hash) setPair(null)
    else if (pair && (pair.original === hash || pair.cutout === hash)) return
    else api.assetInfo(scope, hash).then((p) => live && setPair(p), () => live && setPair(null))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, scope === 'library' ? 'library' : scope.workshopId])
  return pair
}

/** Whether a pool entry answers a search: every word of the query starts one of its tags. */
export const matchesTags = (entry: PoolAsset, query: string): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.every((w) => entry.tags.some((tag) => tag.split(/\s+/).some((part) => part.startsWith(w)) || tag.startsWith(w)))
}

/**
 * Pick a picture: from the theme's pool (pictures and icons, found by their tags; the kind the field is for comes
 * first), one used on a slide already, or a new upload (stored once by its content, docs/slides.md).
 */
export function PicturePicker({ open, onClose, onPick, scope, known, current, theme, prefer = 'picture' }: { open: boolean; onClose: () => void; onPick: (hash: string) => void; scope: AssetScope; known: string[]; current?: string; theme?: string; prefer?: PoolKind }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const pool = usePool(theme ?? '')
  const kinds: PoolKind[] = prefer === 'icon' ? ['icon', 'picture'] : ['picture', 'icon']
  const pick = (hash: string) => {
    onPick(hash)
    onClose()
  }
  const upload = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const asset = await api.uploadAsset(scope, file)
      // An illustration freed of its flat background at upload is shown as the cut-out; the field can switch back.
      onPick(asset.cutout ?? asset.hash)
      onClose()
    } catch (err) {
      setError(uploadProblem(err, file.name, t))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} width="max-w-2xl">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="mr-auto text-[16px] font-semibold">{t('editor.pickPicture')}</h2>
        <Button size="sm" onClick={() => input.current?.click()} disabled={busy}>
          <Upload size={13} />
          {busy ? t('common.uploading') : t('editor.uploadPicture')}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void upload(file)
          }}
        />
      </div>
      {error && <p className="mb-2 text-[13px] text-rose">{error}</p>}
      {pool.length > 0 && (
        <div className="mb-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('editor.searchPool')} aria-label={t('editor.searchPool')} className="field mb-2 h-8 w-full px-2 text-[13px]" autoFocus />
          {kinds.map((kind) => {
            const entries = pool.filter((e) => e.kind === kind && (!query.trim() || matchesTags(e, query)))
            if (!entries.length) return null
            return (
              <div key={kind} className="mb-3">
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{t(kind === 'icon' ? 'editor.poolIcons' : 'editor.poolPictures')}</div>
                <ul className={cx('grid gap-2', kind === 'icon' ? 'grid-cols-5 md:grid-cols-8' : 'grid-cols-3 md:grid-cols-4')}>
                  {entries.map((e) => (
                    <li key={e.hash}>
                      <button type="button" onClick={() => pick(e.hash)} title={e.tags.join(', ')} className={cx('block w-full overflow-hidden rounded-md border bg-surface-2 ring-offset-2 ring-offset-surface', kind === 'icon' ? 'aspect-square p-1.5' : 'aspect-[4/3]', e.hash === current ? 'border-accent ring-2 ring-accent' : 'border-line hover:border-ink-3')}>
                        <img src={assetUrl(scope, e.hash)} alt={e.tags.join(', ')} className={cx('h-full w-full', kind === 'icon' ? 'object-contain' : 'object-cover')} loading="lazy" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
      {known.length ? (
        <>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{t('editor.knownPictures')}</div>
          <ul className="grid grid-cols-3 gap-2 md:grid-cols-4">
            {known.map((hash) => (
              <li key={hash}>
                <button
                  type="button"
                  onClick={() => pick(hash)}
                  className={cx('block aspect-[4/3] w-full overflow-hidden rounded-md border bg-surface-2 ring-offset-2 ring-offset-surface', hash === current ? 'border-accent ring-2 ring-accent' : 'border-line hover:border-ink-3')}
                >
                  <img src={assetUrl(scope, hash)} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : pool.length ? null : (
        <p className="py-6 text-center text-[14px] text-ink-2">{t('editor.noPictures')}</p>
      )}
    </Modal>
  )
}
