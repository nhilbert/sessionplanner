import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Upload, X } from 'lucide-react'
import { api, type AssetScope, assetUrl } from '@/api'
import { Button, cx, IconButton, Modal } from '@/components/ui'
import { fieldId, useSubDialog } from './fields'

/** A picture field of the slide: the thumbnail of the asset it shows, and the way to choose or remove one. */
export function PictureField({ path, value, onChange, onFocus, scope, known, label }: { path: string; value: string; onChange: (hash: string) => void; onFocus: (path: string) => void; scope: AssetScope; known: string[]; label?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-2" id={fieldId(path)} tabIndex={-1} onFocus={() => onFocus(path)}>
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
      <PicturePicker open={open} onClose={() => setOpen(false)} onPick={onChange} scope={scope} known={known} current={value} />
    </div>
  )
}

/** Pick a picture: one used on a slide already, or a new upload (stored once by its content, docs/slides.md). */
export function PicturePicker({ open, onClose, onPick, scope, known, current }: { open: boolean; onClose: () => void; onPick: (hash: string) => void; scope: AssetScope; known: string[]; current?: string }) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useSubDialog(open)
  const upload = async (file: File) => {
    setBusy(true)
    setError('')
    try {
      const asset = await api.uploadAsset(scope, file)
      onPick(asset.hash)
      onClose()
    } catch {
      setError(t('files.failed', { name: file.name }))
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
      {known.length ? (
        <>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">{t('editor.knownPictures')}</div>
          <ul className="grid grid-cols-3 gap-2 md:grid-cols-4">
            {known.map((hash) => (
              <li key={hash}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(hash)
                    onClose()
                  }}
                  className={cx('block aspect-[4/3] w-full overflow-hidden rounded-md border bg-surface-2 ring-offset-2 ring-offset-surface', hash === current ? 'border-accent ring-2 ring-accent' : 'border-line hover:border-ink-3')}
                >
                  <img src={assetUrl(scope, hash)} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-6 text-center text-[14px] text-ink-2">{t('editor.noPictures')}</p>
      )}
    </Modal>
  )
}
