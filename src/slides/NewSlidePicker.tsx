import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Image, LayoutTemplate, Upload } from 'lucide-react'
import { api } from '@/api'
import { useThemes } from '@/store/useThemes'
import { Button, Modal, Segmented } from '@/components/ui'
import { type AssetScope, SlideView } from './SlideView'
import { LayoutGrid } from './editor/LayoutPicker'
import { blankSlide, pictureSlide } from './templates'
import { tr } from './editor/fields'

type Tab = 'templates' | 'layouts' | 'picture'

/**
 * A new slide (docs/slides.md, section 7): from a template, as a blank layout, or from a picture; the owner can
 * also pick from the pool. A template or a blank opens in the editor right away.
 */
export function NewSlidePicker({ open, onClose, onPick, onPool, theme, scope, owner }: { open: boolean; onClose: () => void; onPick: (html: string[], edit: boolean) => void; onPool?: () => void; theme: string; scope: AssetScope; owner: boolean }) {
  const { t } = useTranslation()
  const { templates, templatesLoaded, loadTemplates } = useThemes()
  const [tab, setTab] = useState<Tab>(owner ? 'templates' : 'layouts')
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open && owner) void loadTemplates()
  }, [open, owner, loadTemplates])
  useEffect(() => {
    // Without templates, the layouts are the natural first page.
    if (open && owner && templatesLoaded && !templates.length && tab === 'templates') setTab('layouts')
  }, [open, owner, templatesLoaded, templates.length, tab])
  const pick = (html: string[], edit: boolean) => {
    onPick(html, edit)
    onClose()
  }
  const upload = async (files: File[]) => {
    setBusy(true)
    const html: string[] = []
    for (const file of files) {
      try {
        const asset = await api.uploadAsset(scope, file)
        html.push(pictureSlide(asset.hash, file.name.replace(/\.[a-z0-9]+$/i, '')))
      } catch {
        window.alert(t('files.failed', { name: file.name }))
      }
    }
    setBusy(false)
    if (html.length) pick(html, false)
  }
  const tabs: { value: Tab; label: string }[] = [...(owner ? [{ value: 'templates' as Tab, label: t('slides.fromTemplate') }] : []), { value: 'layouts', label: t('slides.fromLayout') }, { value: 'picture', label: t('slides.fromPicture') }]

  return (
    <Modal open={open} onClose={onClose} width="max-w-4xl" top="pt-[max(1rem,env(safe-area-inset-top))] md:pt-[6vh]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[16px] font-semibold">{t('slides.new')}</h2>
        <Segmented<Tab> size="sm" value={tab} onChange={setTab} options={tabs} />
        {owner && onPool && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onClose()
              onPool()
            }}
          >
            <LayoutTemplate size={13} />
            {t('slides.fromPool')}
          </Button>
        )}
      </div>
      {tab === 'templates' && (
        <div>
          {templatesLoaded && !templates.length && <p className="py-8 text-center text-[14px] text-ink-2">{t('slides.templatesEmpty')}</p>}
          <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
            {templates.map((tpl) => (
              <li key={tpl.id}>
                <button type="button" onClick={() => pick([tpl.html], true)} className="block w-full rounded-lg p-1 text-left transition-colors hover:bg-surface-2" aria-label={tpl.name || t('templates.untitled')}>
                  <SlideView html={tpl.html} theme={theme} scope={scope} />
                  <div className="mt-1 truncate px-0.5 text-[13px] font-medium">{tpl.name || t('templates.untitled')}</div>
                  <div className="truncate px-0.5 text-[11px] text-ink-3">{tr(t, `slides.layouts.${tpl.layout}`, { defaultValue: tpl.layout })}</div>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-ink-3">
            <Link to="/templates" className="hover:text-ink hover:underline" onClick={onClose}>
              {t('slides.manageTemplates')}
            </Link>
          </p>
        </div>
      )}
      {tab === 'layouts' && <LayoutGrid theme={theme} scope={scope} onPick={(l) => pick([blankSlide(l, t)], true)} />}
      {tab === 'picture' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Image size={28} className="text-ink-3" />
          <p className="max-w-sm text-[14px] text-ink-2">{t('slides.picture')}</p>
          <Button onClick={() => input.current?.click()} disabled={busy}>
            <Upload size={14} />
            {busy ? t('common.uploading') : t('editor.uploadPicture')}
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
              if (files.length) void upload(files)
            }}
          />
        </div>
      )}
    </Modal>
  )
}
