import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { cx } from '@/components/ui'

/**
 * The slides area (docs/slides.md, section 7): the pool, the templates and the themes – what slides are made from –
 * under one entry of the navigation, as tabs at the top of each of its pages.
 */
const TABS = [
  { to: '/slides/pool', key: 'slidesNav.pool' },
  { to: '/slides/templates', key: 'slidesNav.templates' },
  { to: '/slides/themes', key: 'slidesNav.themes' },
] as const

export function SlidesTabs() {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('slidesNav.label')} className="-mt-2 mb-5 flex gap-1 overflow-x-auto border-b border-line md:-mt-4">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => cx('-mb-px shrink-0 border-b-2 px-3 py-2 text-[14px] transition-colors pointer-coarse:py-2.5', isActive ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink')}
        >
          {t(tab.key)}
        </NavLink>
      ))}
    </nav>
  )
}
