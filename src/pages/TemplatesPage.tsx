import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Copy, Pencil, Plus, Trash2 } from 'lucide-react'
import type { SlideTemplate } from '@/domain/types'
import { useThemes } from '@/store/useThemes'
import { useSettings } from '@/store/useSettings'
import { Button, Empty, IconButton, PageHeader } from '@/components/ui'
import Menu from '@/components/Menu'
import { TextField } from '@/planner/fields'
import { SlideView } from '@/slides/SlideView'
import { NewSlidePicker } from '@/slides/NewSlidePicker'
import { SlideEditor } from '@/slides/editor/SlideEditor'
import { tr } from '@/slides/editor/fields'

/** The owner's template slides (docs/slides.md, section 7): named slides to start new slides from, in the order the picker shows them. */
export default function TemplatesPage() {
  const { t } = useTranslation()
  const { templates, templatesLoaded, loadTemplates, saveTemplate, removeTemplate } = useThemes()
  const theme = useSettings((s) => s.settings.theme) || 'default'
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    void loadTemplates(true)
  }, [loadTemplates])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const add = async (html: string[]) => {
    let last: SlideTemplate | null = null
    for (const h of html) last = await saveTemplate({ name: '', html: h })
    if (last) {
      // A fresh template takes the layout's name until it is renamed.
      last = await saveTemplate({ name: tr(t, `slides.layouts.${last.layout}`, { defaultValue: last.layout }), html: last.html }, last.id)
      setEditing(last.id)
    }
  }
  const move = async (tpl: SlideTemplate, dir: -1 | 1) => {
    const i = templates.indexOf(tpl)
    const other = templates[i + dir]
    if (!other) return
    await saveTemplate({ name: tpl.name, html: tpl.html, position: other.position }, tpl.id)
    await saveTemplate({ name: other.name, html: other.html, position: tpl.position }, other.id)
  }
  const current = editing ? templates.find((x) => x.id === editing) : undefined

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-10 md:py-10">
        <PageHeader
          title={t('templates.title')}
          subtitle={t('templates.subtitle')}
          right={
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus size={13} />
              {t('templates.new')}
            </Button>
          }
        />
        {templatesLoaded && !templates.length && <Empty title={t('templates.empty')} body={t('templates.emptyHint')} />}
        <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {templates.map((tpl, i) => (
            <li key={tpl.id} className="card overflow-hidden">
              <SlideView html={tpl.html} theme={theme} scope="library" onClick={() => setEditing(tpl.id)} label={tpl.name} className="rounded-none" />
              <div className="flex items-center gap-1 px-2 py-1.5">
                <TextField value={tpl.name} onCommit={(name) => void saveTemplate({ name, html: tpl.html }, tpl.id)} placeholder={t('templates.untitled')} aria-label={t('templates.name')} className="field-bare h-8 min-w-0 flex-1 px-2 text-[14px] font-medium" />
                <IconButton label={t('templates.edit')} onClick={() => setEditing(tpl.id)}>
                  <Pencil size={14} />
                </IconButton>
                <Menu
                  label={t('planner.actions')}
                  title={tpl.name}
                  items={[
                    { label: t('templates.up'), icon: <ArrowLeft size={15} />, onSelect: () => void move(tpl, -1) },
                    { label: t('templates.down'), icon: <ArrowRight size={15} />, onSelect: () => void move(tpl, 1) },
                    { label: t('templates.duplicate'), icon: <Copy size={15} />, onSelect: () => void saveTemplate({ name: t('templates.copyName', { name: tpl.name }), html: tpl.html }) },
                    { label: t('templates.delete'), icon: <Trash2 size={15} />, danger: true, onSelect: () => window.confirm(t('templates.deleteConfirm', { name: tpl.name })) && void removeTemplate(tpl.id) },
                  ]}
                />
              </div>
              <div className="px-4 pb-2 text-[11px] text-ink-3">
                {i + 1} · {tr(t, `slides.layouts.${tpl.layout}`, { defaultValue: tpl.layout })}
              </div>
            </li>
          ))}
        </ul>
        <NewSlidePicker open={adding} onClose={() => setAdding(false)} onPick={(html) => void add(html)} theme={theme} scope="library" owner />
        {current && (
          <SlideEditor
            slides={[{ id: current.id, html: current.html }]}
            index={0}
            onIndex={() => undefined}
            onChange={(slides) => {
              const s = slides.find((x) => x.id === current.id)
              if (s) void saveTemplate({ name: current.name, html: s.html }, current.id)
              else void removeTemplate(current.id)
            }}
            onClose={() => setEditing(null)}
            theme={theme}
            scope="library"
            owner
            canEdit
            known={[]}
            onNotice={setNotice}
          />
        )}
        {notice && <div className="no-print fade-in fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-[13px] text-paper shadow-[var(--shadow)] md:bottom-6">{notice}</div>}
      </div>
    </div>
  )
}
