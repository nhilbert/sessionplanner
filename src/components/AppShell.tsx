import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BookMarked, CalendarDays, Ellipsis, Images, PanelLeftClose, PanelLeftOpen, Presentation, Settings } from 'lucide-react'
import { useSettings } from '@/store/useSettings'
import { LOGIN_REQUIRED } from '@/api'
import { productName } from '@/features'
import { cx, Sheet, useLocalState } from './ui'

const NAV = [
  { to: '/', key: 'nav.workshops', icon: CalendarDays, end: false, owner: false },
  // Not `end`: an entry's own page (/library/:id) is still the library.
  { to: '/library', key: 'nav.library', icon: BookMarked, end: false, owner: true },
  // The slides area (pool, templates, themes) under one entry; its pages have tabs.
  { to: '/slides', key: 'nav.slides', icon: Presentation, end: false, owner: true },
  // The picture pool: pictures for the generated slides and icons for cards (docs/slides.md, section 4).
  { to: '/pictures', key: 'nav.pictures', icon: Images, end: true, owner: true },
] as const

/** The width from which the navigation stands on the left (Tailwind's md). */
const wideScreen = () => window.matchMedia('(min-width: 48rem)')
const onWidthChange = (listener: () => void) => {
  const query = wideScreen()
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/**
 * The frame shared with Zendo and the Revenue Tracker: navigation on the left (icons only when folded), a bottom bar
 * on phones. The bar holds the pages and, where a build adds a menu of its own, one "More" for the settings and that
 * menu: a bar has room for five entries, not for a build's as well.
 */
export default function AppShell({ menu }: { menu?: (options: { folded: boolean }) => ReactNode }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  // The two navigations are both in the page, one hidden; what a build adds appears once, in the one that shows.
  const wide = useSyncExternalStore(onWidthChange, () => wideScreen().matches)
  const [folded, setFolded] = useLocalState('sp.nav', 'open')
  const { load, loadMe, me } = useSettings()
  const collapsed = folded === 'folded'
  // Guests see their shared workshops, the library to read (when the owner switched it on for them) and the language
  // setting; the slides area is the owner's.
  const nav = me.owner ? NAV : NAV.filter((n) => !n.owner || (n.to === '/library' && me.library))

  const [loginExpired, setLoginExpired] = useState(false)
  const [more, setMore] = useState(false)
  useEffect(() => setMore(false), [pathname])
  const barItem = (active: boolean) => cx('flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', active ? 'font-bold text-accent-strong' : 'font-medium text-ink-2')
  // On a page the bar has no entry for (the settings, a build's own pages) "More" is the one that is open.
  const elsewhere = !nav.some((n) => (n.to === '/' ? /^\/(w\/|$)/.test(pathname) : pathname.startsWith(n.to)))
  useEffect(() => {
    void load()
    void loadMe()
    const onExpired = () => setLoginExpired(true)
    window.addEventListener(LOGIN_REQUIRED, onExpired)
    return () => window.removeEventListener(LOGIN_REQUIRED, onExpired)
  }, [load, loadMe])

  const link = (to: string, label: string, Icon: typeof Settings, end?: boolean) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cx(
          'flex h-9 items-center gap-2.5 rounded-full text-[14px] transition-colors',
          collapsed ? 'justify-center px-0' : 'px-3',
          // The entry of the page that is open stands as a cut-out in the ground's colour.
          isActive || (to === '/' && /^\/(w\/|$)/.test(pathname)) ? 'bg-paper font-semibold text-brand-ink' : 'font-medium text-on-brand-2 hover:bg-on-brand/10 hover:text-on-brand',
        )
      }
    >
      <Icon size={16} strokeWidth={1.75} className="shrink-0" />
      {!collapsed && label}
    </NavLink>
  )

  return (
    <div className="flex h-dvh">
      {/* Phones with a notch: the strip above the page takes the brand colour, as the navigation does on wide screens. */}
      <div aria-hidden className="no-print fixed inset-x-0 top-0 z-30 h-[env(safe-area-inset-top)] bg-brand md:hidden" />
      <aside className={cx('nav-surface no-print sticky top-0 hidden h-dvh shrink-0 flex-col bg-brand py-6 md:flex', collapsed ? 'w-[60px] px-2' : 'w-[216px] px-3')}>
        <div className={cx('mb-8 flex items-center gap-2', collapsed ? 'justify-center' : 'px-2')}>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7 shrink-0" />
          {!collapsed && <span className="app-title text-[19px] text-on-brand">{productName()}</span>}
        </div>
        <nav className="flex flex-col gap-1">{nav.map((n) => link(n.to, t(n.key), n.icon, n.end))}</nav>
        {wide && menu?.({ folded: collapsed })}
        <div className="mt-auto flex flex-col gap-1">
          {!me.owner && me.email && !collapsed && <p className="mb-2 truncate px-3 text-[12px] text-on-brand-2" title={me.email}>{t('guest.signedInAs', { email: me.email })}</p>}
          {link('/settings', t('nav.settings'), Settings, true)}
          <button
            type="button"
            onClick={() => setFolded(collapsed ? 'open' : 'folded')}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            className={cx('flex h-9 items-center gap-2.5 rounded-full text-[13px] text-on-brand-2 hover:bg-on-brand/10 hover:text-on-brand', collapsed ? 'justify-center' : 'px-3')}
          >
            {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
            {!collapsed && t('nav.collapse')}
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] md:pb-0">
        {loginExpired && (
          <div className="no-print flex items-center justify-between gap-3 bg-amber-soft px-4 py-2 text-[13px] text-amber md:px-6">
            {t('common.login')}
            <button type="button" onClick={() => window.location.reload()} className="shrink-0 rounded-md border border-amber/40 px-2.5 py-1 font-medium hover:bg-amber/10">
              {t('common.signIn')}
            </button>
          </div>
        )}
        <Outlet />
      </div>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {[...nav, ...(menu ? [] : [{ to: '/settings', key: 'nav.settings', icon: Settings, end: true } as const])].map(({ to, key, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => barItem(isActive || (to === '/' && /^\/w\//.test(pathname)))}>
            <Icon size={18} strokeWidth={1.75} />
            <span className="max-w-full truncate px-0.5">{t(key)}</span>
          </NavLink>
        ))}
        {menu && (
          <button type="button" aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore(true)} className={barItem(elsewhere)}>
            <Ellipsis size={18} strokeWidth={1.75} />
            {t('nav.more')}
          </button>
        )}
      </nav>
      {menu && !wide && (
        <Sheet open={more} onClose={() => setMore(false)} label={t('nav.more')}>
          {/* A link taken closes the sheet (some load the page anew, the others change the page below it). */}
          <div onClick={(e) => (e.target as HTMLElement).closest('a') && setMore(false)}>
            <NavLink to="/settings" end className={({ isActive }) => cx('flex h-12 items-center gap-3 rounded-lg px-2 text-[15px] active:bg-surface-2', isActive && 'font-semibold text-accent-strong')}>
              <span className="flex w-5 shrink-0 justify-center text-ink-3">
                <Settings size={18} strokeWidth={1.75} />
              </span>
              {t('nav.settings')}
            </NavLink>
            <div className="mt-1 border-t border-line pt-1">{menu({ folded: false })}</div>
          </div>
        </Sheet>
      )}
    </div>
  )
}
