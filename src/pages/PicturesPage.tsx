import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { useThemes } from '@/store/useThemes'
import { useSettings } from '@/store/useSettings'
import { PageHeader, Select } from '@/components/ui'
import { PoolEditor } from '@/slides/PoolEditor'

/**
 * The picture pool (docs/slides.md, section 4): the pictures the generated slides take in turn and the icons cards
 * may carry, with their tags. A pool belongs to a theme as data; the page opens on the default theme's pool and
 * switches between the themes that have one.
 */
export default function PicturesPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const { themes, load } = useThemes()
  const settings = useSettings((s) => s.settings)
  useEffect(() => {
    void load(true)
  }, [load])
  const data = useMemo(() => themes.filter((x) => x.kind === 'data'), [themes])
  const chosen = params.get('theme')
  const selected = data.find((x) => x.id === chosen)?.id ?? data.find((x) => x.id === settings.theme)?.id ?? data[0]?.id ?? ''
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-10 md:py-10">
        <PageHeader
          title={t('pictures.title')}
          subtitle={t('pictures.subtitle')}
          right={
            data.length > 1 ? (
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                {t('pictures.theme')}
                <Select value={selected} onChange={(e) => setParams({ theme: e.target.value }, { replace: true })} className="h-8 text-[13px]" aria-label={t('pictures.theme')}>
                  {data.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </Select>
              </label>
            ) : undefined
          }
        />
        {selected ? (
          <div className="card p-5">
            {data.length === 1 && <p className="mb-4 text-[12px] text-ink-3">{t('pictures.belongsTo', { name: data[0].name })}</p>}
            <PoolEditor key={selected} themeId={selected} large />
          </div>
        ) : (
          <p className="text-[14px] text-ink-2">
            {t('pictures.noTheme')}{' '}
            <Link to="/slides/themes" className="underline hover:text-ink">
              {t('themes.manage')}
            </Link>
          </p>
        )}
      </div>
    </div>
  )
}
