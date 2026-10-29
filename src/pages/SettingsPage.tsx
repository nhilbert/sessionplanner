import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, Upload } from 'lucide-react'
import { api } from '@/api'
import { newId } from '@/domain/ops'
import { categoryName, useSettings } from '@/store/useSettings'
import { changeLocale } from '@/i18n'
import { Button, IconButton, PageHeader, SectionLabel, Segmented } from '@/components/ui'
import Swatches from '@/components/Swatches'
import { TextField, TimeField } from '@/planner/fields'

const MAX_LOGO = 2 * 1024 * 1024

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { settings, update, setLogo, removeLogo, me } = useSettings()
  const input = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState('')
  const logoUrl = api.logoUrl(settings)

  const setCategory = (id: string, patch: { name?: string; color?: (typeof settings.categories)[number]['color'] }) =>
    update({ categories: settings.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-10 md:py-10">
        <PageHeader title={t('nav.settings')} />

        <section className="card mb-6 p-5">
          <SectionLabel>{t('settings.language')}</SectionLabel>
          <div className="flex items-center gap-3">
            <Segmented
              value={i18n.language === 'de' ? 'de' : 'en'}
              onChange={(v) => changeLocale(v)}
              options={[
                { value: 'de', label: 'Deutsch' },
                { value: 'en', label: 'English' },
              ]}
            />
            <span className="text-[13px] text-ink-3">{t('settings.languageHint')}</span>
          </div>
        </section>

        {me.owner && (
          <>
        <section className="card mb-6 p-5">
          <SectionLabel>{t('settings.days')}</SectionLabel>
          <div className="flex flex-wrap items-center gap-3 text-[14px] text-ink-2">
            <span>{t('planner.start')}</span>
            <TimeField value={settings.dayStart} onChange={(v) => v !== null && update({ dayStart: v })} className="w-[72px]" aria-label={t('planner.start')} />
            <span>{t('planner.end')}</span>
            <TimeField value={settings.dayEnd} nullable onChange={(v) => update({ dayEnd: v })} className="w-[72px]" aria-label={t('planner.end')} />
          </div>
          <p className="mt-2 text-[13px] text-ink-3">{t('settings.daysHint')}</p>
        </section>

        <section className="card mb-6 p-5">
          <SectionLabel>{t('settings.categories')}</SectionLabel>
          <p className="mb-3 text-[13px] text-ink-3">{t('settings.categoriesHint')}</p>
          <ul className="space-y-3">
            {settings.categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3">
                <span className="h-5 w-1 shrink-0 rounded-full" style={{ background: `var(--c-${c.color})` }} />
                <TextField value={c.name} placeholder={categoryName({ ...c, name: '' }, t)} onCommit={(name) => setCategory(c.id, { name })} className="h-8 w-44 text-[14px]" />
                <Swatches value={c.color} onChange={(color) => color && setCategory(c.id, { color })} />
                <IconButton label={t('settings.removeCategory')} onClick={() => update({ categories: settings.categories.filter((x) => x.id !== c.id) })} className="ml-auto">
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => update({ categories: [...settings.categories, { id: newId(), name: t('settings.newCategory'), color: 'moss' }] })}>
            <Plus size={13} />
            {t('settings.addCategory')}
          </Button>
        </section>

        <section className="card p-5">
          <SectionLabel>{t('settings.logo')}</SectionLabel>
          <p className="mb-3 text-[13px] text-ink-3">{t('settings.logoHint')}</p>
          {logoUrl && (
            <div className="mb-3 inline-flex rounded-lg border border-line bg-white p-3">
              <img src={logoUrl} alt="" className="max-h-16 max-w-[240px] object-contain" />
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => input.current?.click()}>
              <Upload size={13} />
              {t('settings.uploadLogo')}
            </Button>
            {logoUrl && (
              <Button size="sm" variant="danger" onClick={() => void removeLogo()}>
                <Trash2 size={13} />
                {t('settings.removeLogo')}
              </Button>
            )}
          </div>
          {logoError && <p className="mt-2 text-[13px] text-rose">{logoError}</p>}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              setLogoError('')
              if (file.size > MAX_LOGO) return setLogoError(t('settings.logoTooLarge'))
              await setLogo(file).catch(() => setLogoError(t('settings.logoFailed')))
            }}
          />
        </section>
          </>
        )}
      </div>
    </div>
  )
}
