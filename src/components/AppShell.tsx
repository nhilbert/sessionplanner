import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import { BookMarked, CalendarDays, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { useSettings } from '@/store/useSettings'
import { LOGIN_REQUIRED } from '@/api'
import { cx, useLocalState } from './ui'

const NAV = [
  { to: '/', key: 'nav.workshops', icon: CalendarDays, end: false },
  { to: '/library', key: 'nav.library', icon: BookMarked, end: true },
] as const

/** The frame shared with Zendo and the Revenue Tracker: navigation on the left (icons only when folded), a bottom bar on phones. */
export default function AppShell() {
  const { t } = useTranslation()
  const [folded, setFolded] = useLocalState('sp.nav', 'open')
  const { load, loadMe, me } = useSettings()
  const collapsed = folded === 'folded'
  // Guests see their shared workshops and the language setting; the library is the owner's.
  const nav = me.owner ? NAV : NAV.filter((n) => n.to !== '/library')

  const [loginExpired, setLoginExpired] = useState(false)
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
          'flex items-center gap-2.5 rounded-lg py-[7px] text-[14px] transition-colors',
          collapsed ? 'justify-center px-0' : 'px-2.5',
          isActive || (to === '/' && /^\/(w\/|$)/.test(location.pathname)) ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      <Icon size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" />
      {!collapsed && label}
    </NavLink>
  )

  return (
    <div className="flex h-dvh">
      <aside className={cx('no-print sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line py-7 md:flex', collapsed ? 'w-[60px] px-2' : 'w-[216px] px-4')}>
        <div className={cx('mb-8 flex items-center gap-2', collapsed ? 'justify-center' : 'px-2')}>
          <span className="inline-block h-3 w-3 shrink-0 rounded-full border-[2.5px] border-accent" />
          {!collapsed && <span className="text-[15px] font-medium tracking-[-0.01em]">{t('app.name')}</span>}
        </div>
        <nav className="flex flex-col gap-0.5">{nav.map((n) => link(n.to, t(n.key), n.icon, n.end))}</nav>
        <div className="mt-auto flex flex-col gap-0.5">
          {!me.owner && me.email && !collapsed && <p className="mb-2 truncate px-2.5 text-[12px] text-ink-3" title={me.email}>{t('guest.signedInAs', { email: me.email })}</p>}
          {link('/settings', t('nav.settings'), Settings, true)}
          <button
            type="button"
            onClick={() => setFolded(collapsed ? 'open' : 'folded')}
            title={collapsed ? t('nav.expand') : t('nav.collapse')}
            className={cx('flex items-center gap-2.5 rounded-lg py-[7px] text-[13px] text-ink-3 hover:bg-surface-2 hover:text-ink', collapsed ? 'justify-center' : 'px-2.5')}
          >
            {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
            {!collapsed && t('nav.collapse')}
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
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
        {[...nav, { to: '/settings', key: 'nav.settings', icon: Settings, end: true } as const].map(({ to, key, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', isActive ? 'text-ink' : 'text-ink-3')}>
            <Icon size={18} strokeWidth={1.75} />
            {t(key)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
