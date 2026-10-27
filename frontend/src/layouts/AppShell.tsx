import { Link, NavLink, Outlet } from 'react-router'

import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { DESKTOP_NAV, MOBILE_NAV } from './navigation'

/** Round button to the account page, shown in both headers. */
function AccountButton({ onBlue }: { onBlue: boolean }) {
  return (
    <Link
      to="/account"
      aria-label="Account"
      className={`grid size-10 place-items-center rounded-full ${
        onBlue ? 'text-white hover:bg-white/15' : 'text-on-surface-variant hover:bg-surface-container'
      }`}
    >
      <Icon name="account_circle" className="text-[28px]" />
    </Link>
  )
}

/** Desktop header: logo, search, report button and account. */
function DesktopHeader() {
  return (
    <header className="hidden h-16 shrink-0 items-center gap-6 bg-primary px-6 text-white lg:flex">
      <Link to="/" aria-label="Sarathi home">
        <Logo onBlue />
      </Link>
      <Link
        to="/directions"
        className="flex h-10 w-full max-w-md items-center gap-3 rounded-md bg-white/95 px-3 text-body-md text-text-secondary hover:bg-white"
      >
        <Icon name="search" className="text-[20px]" />
        Search places and facilities
      </Link>
      <div className="flex-1" />
      <Link
        to="/report"
        className="flex h-10 items-center gap-2 rounded-full bg-hazard-closure-red px-5 text-label-lg text-white hover:brightness-110"
      >
        <Icon name="add_location_alt" className="text-[20px]" />
        Report hazard
      </Link>
      <AccountButton onBlue />
    </header>
  )
}

/** Phone header: logo and account. */
function MobileHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-muted bg-surface-container-lowest px-4 lg:hidden">
      <Link to="/" aria-label="Sarathi home">
        <Logo />
      </Link>
      <AccountButton onBlue={false} />
    </header>
  )
}

/** Desktop side navigation. */
function SideNav() {
  return (
    <nav aria-label="Main" className="hidden w-62 shrink-0 flex-col gap-1 border-r border-border-muted p-3 lg:flex">
      {DESKTOP_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex h-11 items-center gap-3 rounded-lg px-4 text-label-lg ${
              isActive ? 'bg-primary-fixed text-on-primary-fixed' : 'text-on-surface-variant hover:bg-surface-container'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} filled={isActive} className="text-[22px]" />
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** Phone bottom navigation bar. */
function BottomNav() {
  return (
    <nav
      aria-label="Main"
      className="grid shrink-0 grid-cols-4 border-t border-border-muted bg-surface-tint-light pb-safe lg:hidden"
    >
      {MOBILE_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className="flex h-20 flex-col items-center justify-center gap-1 text-label-md"
        >
          {({ isActive }) => (
            <>
              <span
                className={`grid h-8 w-16 place-items-center rounded-full ${
                  isActive ? 'bg-primary-fixed text-on-primary-fixed' : 'text-on-surface-variant'
                }`}
              >
                <Icon name={item.icon} filled={isActive} />
              </span>
              <span className={isActive ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}>
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** The frame around every page: headers and navigation, the page panel, and the map beside it on desktop. */
export function AppShell() {
  return (
    <div className="flex h-dvh flex-col">
      <DesktopHeader />
      <MobileHeader />
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-5 lg:w-100 lg:flex-none lg:border-r lg:border-border-muted lg:px-6">
          <Outlet />
        </main>
        {/* The Leaflet map goes here in the map phase; on phones it will sit under a bottom sheet. */}
        <section aria-label="Map" className="hidden flex-1 bg-surface-tint-medium lg:block" />
      </div>
      <BottomNav />
    </div>
  )
}
