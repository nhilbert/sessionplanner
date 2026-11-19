import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BookMarked, CalendarDays, Ellipsis, Images, type LucideIcon, PanelLeftClose, PanelLeftOpen, Presentation, Settings } from 'lucide-react'
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

/** The room a part of the navigation has: the open navigation, the folded one (icons alone), the phone's sheet behind "More". */
export type NavForm = 'open' | 'folded' | 'sheet'

/** A page a build adds to the navigation. It stands with the owner's pages unless `guests` says it is for guests too. */
export interface NavPage {
  to: string
  label: () => string
  icon: LucideIcon
  guests?: boolean
}

/**
 * What a build adds to the navigation: three places, each drawn in the form its place has. Without any of them the
 * navigation is the app's own: the name, the pages, the settings.
 */
export interface NavExtensions {
  /** Under the name: where the person is, and the way to the other places of that kind (a workspace and its others). */
  place?: (options: { form: NavForm }) => ReactNode
  /** Pages of its own, above the settings. */
  pages?: NavPage[]
  /** At the foot: who is signed in, and what belongs to the login (signing out, the legal pages). */
  account?: (options: { form: NavForm }) => ReactNode
}

/** The width from which the navigation stands on the left (Tailwind's md). */
const wideScreen = () => window.matchMedia('(min-width: 48rem)')
const onWidthChange = (listener: () => void) => {
  const query = wideScreen()
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/**
 * The frame shared with Zendo and the Revenue Tracker: navigation on the left (icons only when folded), a bottom bar
 * on phones. The navigation has one order, top to bottom: the name with the button that folds it, where the person is
 * (a build's), the pages, what manages the place (a build's pages, the settings), who is signed in (a build's). The
 * bar holds the pages and, where a build adds to the navigation, one "More" with the rest in the same order: a bar has
 * room for five entries, not for a build's as well.
 */
export default function AppShell({ navigation }: { navigation?: NavExtensions }) {
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
  const added = (navigation?.pages ?? []).filter((p) => me.owner || p.guests)
  const form: NavForm = collapsed ? 'folded' : 'open'

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
      <aside className={cx('nav-surface no-print sticky top-0 hidden h-dvh shrink-0 flex-col overflow-y-auto overscroll-contain bg-brand py-6 md:flex', collapsed ? 'w-[60px] px-2' : 'w-[232px] px-3')}>
        {/* The name keeps its room beside the button: a build's longer name is cut with an ellipsis, not the button. */}
        <div className={cx('flex items-center', collapsed ? 'flex-col gap-2.5' : 'pl-2')}>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7 shrink-0" />
          {!collapsed && <span className="app-title ml-2 min-w-0 flex-1 truncate text-[19px] text-on-brand" title={productName()}>{productName()}</span>}
          <button
            type="button"
            onClick={() => setFolded(collapsed ? 'open' : 'folded')}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
            className={cx('tap flex h-7 shrink-0 items-center justify-center rounded-full text-on-brand-2 transition-colors hover:bg-on-brand/10 hover:text-on-brand', collapsed ? 'w-9' : '-mr-1 w-7')}
          >
            {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
          </button>
        </div>
        {wide && navigation?.place && <div className="mt-5">{navigation.place({ form })}</div>}
        <nav className={cx('flex flex-col gap-1', navigation?.place ? 'mt-4' : 'mt-7')}>{nav.map((n) => link(n.to, t(n.key), n.icon, n.end))}</nav>
        <div className="mt-auto flex flex-col gap-1 pt-4">
          {/* A build that shows who is signed in does it at the foot, in its own words. */}
          {!navigation?.account && !me.owner && me.email && !collapsed && <p className="mb-2 truncate px-3 text-[12px] text-on-brand-2" title={me.email}>{t('guest.signedInAs', { email: me.email })}</p>}
          {added.map((p) => link(p.to, p.label(), p.icon, true))}
          {link('/settings', t('nav.settings'), Settings, true)}
        </div>
        {wide && navigation?.account && <div className="mt-3 border-t border-line pt-2">{navigation.account({ form })}</div>}
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
        {[...nav, ...(navigation ? [] : [{ to: '/settings', key: 'nav.settings', icon: Settings, end: true } as const])].map(({ to, key, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => barItem(isActive || (to === '/' && /^\/w\//.test(pathname)))}>
            <Icon size={18} strokeWidth={1.75} />
            <span className="max-w-full truncate px-0.5">{t(key)}</span>
          </NavLink>
        ))}
        {navigation && (
          <button type="button" aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore(true)} className={barItem(elsewhere)}>
            <Ellipsis size={18} strokeWidth={1.75} />
            {t('nav.more')}
          </button>
        )}
      </nav>
      {navigation && !wide && (
        <Sheet open={more} onClose={() => setMore(false)} label={t('nav.more')}>
          {/* A link taken closes the sheet (some load the page anew, the others change the page below it). */}
          <div onClick={(e) => (e.target as HTMLElement).closest('a') && setMore(false)}>
            {navigation.place && <div className="mb-1 border-b border-line pb-1">{navigation.place({ form: 'sheet' })}</div>}
            {[...added.map((p) => ({ to: p.to, label: p.label(), icon: p.icon })), { to: '/settings', label: t('nav.settings'), icon: Settings }].map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end className={({ isActive }) => cx('flex h-12 items-center gap-3 rounded-lg px-2 text-[15px] active:bg-surface-2', isActive && 'font-semibold text-accent-strong')}>
                <span className="flex w-5 shrink-0 justify-center text-ink-3">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                {label}
              </NavLink>
            ))}
            {navigation.account && <div className="mt-1 border-t border-line pt-1">{navigation.account({ form: 'sheet' })}</div>}
          </div>
        </Sheet>
      )}
    </div>
  )
}
