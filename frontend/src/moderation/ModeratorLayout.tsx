import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router'

import { useClosures } from '../api/closures'
import { useAuth } from '../auth/context'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/icons'
import { Logo } from '../components/Logo'
import { Spinner } from '../components/Spinner'
import { OfflineBanner } from '../pwa/OfflineBanner'
import { buttonClass } from '../components/form/buttonStyles'
import { useStats } from './api'

type NavItem = { to: string; label: string; short: string; icon: IconName; badge?: 'pending' | 'closures' }

const NAV: NavItem[] = [
  { to: '/moderation', label: 'Overview', short: 'Overview', icon: 'dashboard' },
  { to: '/moderation/reports', label: 'Reports', short: 'Reports', icon: 'flag', badge: 'pending' },
  { to: '/moderation/closures', label: 'Active closures', short: 'Closures', icon: 'block', badge: 'closures' },
  { to: '/moderation/audit', label: 'Audit log', short: 'Audit', icon: 'assignment' },
  { to: '/moderation/users', label: 'Users', short: 'Users', icon: 'group' },
]

/** How many reports are waiting and how many closures are active, for the badges in the navigation. */
function useBadges(): Record<'pending' | 'closures', number> {
  const { data: stats } = useStats()
  const { data: closures } = useClosures()
  return { pending: stats?.pending ?? 0, closures: closures?.length ?? stats?.active_closures ?? 0 }
}

/** A count next to a navigation item: amber for reports waiting, red for closed roads. */
function Badge({ kind, count, floating = false }: { kind: 'pending' | 'closures'; count: number; floating?: boolean }) {
  if (!count) return null
  return (
    <span aria-label={`${count} ${kind === 'pending' ? 'waiting' : 'active'}`}
      className={`grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
        kind === 'pending' ? 'bg-pending-amber text-on-surface' : 'bg-hazard-closure-red text-white'} ${
        floating ? 'absolute -top-1.5 left-1/2 ml-1.5' : 'ml-auto'}`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

/** Desktop: the panel's navigation down the left side. */
function Sidebar({ badges }: { badges: ReturnType<typeof useBadges> }) {
  const { user } = useAuth()
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border-muted bg-surface-container-lowest lg:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border-muted px-4">
        <Link to="/moderation" aria-label="Moderator panel home"><Logo className="h-8" /></Link>
        <span className="rounded-sm bg-primary-fixed px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-on-primary-fixed uppercase">Moderator</span>
      </div>
      <nav aria-label="Moderator panel" className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/moderation'}
            className={({ isActive }) => `flex h-10 items-center gap-3 rounded-md px-3 text-label-lg ${
              isActive ? 'bg-primary-fixed text-primary' : 'text-on-surface-variant hover:bg-surface hover:text-on-surface'}`}>
            <Icon name={item.icon} className="text-[20px]" />
            {item.label}
            {item.badge && <Badge kind={item.badge} count={badges[item.badge]} />}
          </NavLink>
        ))}
        <Link to="/" className="mt-auto flex h-10 items-center gap-3 rounded-md border border-border-muted px-3 text-label-lg text-primary hover:bg-surface">
          <Icon name="map" className="text-[20px]" /> Public map
        </Link>
      </nav>
      {user && (
        <Link to="/account" className="flex items-center gap-3 border-t border-border-muted p-4 hover:bg-surface">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-label-lg text-white">
            {user.full_name.trim()[0]?.toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-label-lg text-on-surface">{user.full_name}</span>
            <span className="block truncate text-body-sm text-text-secondary">{user.email}</span>
          </span>
        </Link>
      )}
    </aside>
  )
}

/** Phones: a slim header and the panel's sections along the bottom. */
function PhoneBars({ badges }: { badges: ReturnType<typeof useBadges> }) {
  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-muted bg-surface-container-lowest px-4 pt-safe lg:hidden">
        <span className="flex items-center gap-2">
          <Logo variant="icon" className="size-8" />
          <span className="text-title-md text-on-surface">Moderator panel</span>
        </span>
        <Link to="/" className="flex h-9 items-center gap-1.5 rounded-md border border-border-muted px-3 text-label-lg text-primary">
          <Icon name="map" className="text-[18px]" /> Map
        </Link>
      </header>
      <nav aria-label="Moderator panel" className="order-last grid shrink-0 grid-cols-5 border-t border-border-muted bg-surface-container-lowest px-1 pb-safe lg:hidden">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/moderation'} className="relative flex h-16 items-center justify-center">
            {({ isActive }) => (
              <span className={`relative flex h-13 w-full max-w-17 flex-col items-center justify-center gap-[3px] rounded-md text-[10.5px] font-medium ${
                isActive ? 'bg-primary-fixed text-primary' : 'text-text-secondary'}`}>
                <span className="relative">
                  <Icon name={item.icon} className="text-[20px]" />
                  {item.badge && <Badge kind={item.badge} count={badges[item.badge]} floating />}
                </span>
                {item.short}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}

/** Shown to signed-in people who are not moderators. */
function NotAModerator() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface p-6 text-center">
      <div>
        <title>Moderators only · Sarathi</title>
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-surface-container text-on-surface-variant">
          <Icon name="lock" className="text-[28px]" />
        </span>
        <h1 className="mt-4 text-headline-sm text-on-surface">This area is for moderators</h1>
        <p className="mx-auto mt-2 max-w-xs text-body-md text-text-secondary">
          Moderators check hazard reports before they close any road. Your account isn't a moderator account.
        </p>
        <Link to="/" className={`${buttonClass('primary')} mt-5`}>Back to the map</Link>
      </div>
    </main>
  )
}

/** The moderator panel's frame; only moderators get in. */
export function ModeratorLayout() {
  const { status, user } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <div className="grid min-h-dvh place-items-center"><Spinner label="Checking your session" /></div>
  if (status === 'signed-out') {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  if (user?.role !== 'moderator') return <NotAModerator />
  return <Frame />
}

/** Navigation around the current section. */
function Frame() {
  const badges = useBadges()
  return (
    <div className="flex h-dvh flex-col bg-surface">
      <OfflineBanner />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Sidebar badges={badges} />
        <PhoneBars badges={badges} />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-5 lg:px-8 lg:py-7">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
