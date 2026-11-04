import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import type { WorkshopState } from '@/domain/types'
import { isPrintVariant, type PrintVariant } from '@/domain/print'
import { useSettings } from '@/store/useSettings'
import { useThemes } from '@/store/useThemes'
import { workshopBrand } from '@/domain/theme'
import { themeLabel } from '@/store/useThemes'
import PrintView from '@/print/PrintView'
import SlidesPrint from '@/slides/SlidesPrint'

/**
 * Print views (docs/concept.md, section 6): planning overview, moderation plan, client agenda, packing list – on
 * A4 portrait, with their switches and a Markdown twin. The view is part of the address, so a link opens it directly.
 * The logo is the one of the workshop's theme, or the owner's printout logo when the theme has none.
 */
export default function PrintPage() {
  const { id = '', variant } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [data, setData] = useState<WorkshopState | null>(null)
  const [failed, setFailed] = useState(false)
  const { settings, loaded, load } = useSettings()
  const { themes, load: loadThemes } = useThemes()
  const v: PrintVariant = isPrintVariant(variant) ? variant : 'plan'

  useEffect(() => {
    api.loadWorkshop(id).then(setData, () => setFailed(true))
  }, [id])
  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])
  useEffect(() => {
    void loadThemes()
  }, [loadThemes])
  useEffect(() => {
    if (data && variant !== 'slides') document.title = `${data.workshop.title || t('workshops.untitled')} – ${t(`print.${v}`)}`
  }, [data, v, variant, t])

  if (failed) return <p className="p-8 text-rose">{t('common.missing')}</p>
  if (!data) return <p className="p-8 text-ink-2">{t('common.loading')}</p>
  if (variant === 'slides') return <SlidesPrint data={data} />
  const brand = workshopBrand(data.workshop.theme, settings.theme, themes, api.logoUrl(settings))
  const info = themes.find((x) => x.id === brand.theme)
  return <PrintView key={v} data={data} variant={v} logo={brand.logo} logoSource={brand.source} themeName={info ? themeLabel(info, info.id, t) : brand.theme} categories={settings.categories} onVariant={(next) => void navigate(`/w/${id}/print/${next}`, { replace: true })} />
}
