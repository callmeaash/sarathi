import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatches } from 'react-router'

import { useAuth } from '../auth/context'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { MapView } from '../map/MapView'
import { DESKTOP_NAV, MOBILE_NAV } from './navigation'
import { SheetHandle, type SheetState } from './SheetHandle'

/** The user's initial linking to their account, or a log-in button; shown in both headers. */
function AccountButton({ onBlue }: { onBlue: boolean }) {
  const { status, user } = useAuth()
  if (status === 'loading') return <span className="size-10" aria-hidden />
  if (!user) {
    return (
      <Link
        to="/login"
        className={`flex h-10 items-center rounded-full px-4 text-label-lg ${
          onBlue ? 'border border-white/60 text-white hover:bg-white/15' : 'text-primary hover:bg-surface-tint-light'
        }`}
      >
        Log in
      </Link>
    )
  }
  return (
    <Link
      to="/account"
      aria-label={`Account: ${user.full_name}`}
      className={`grid size-10 place-items-center rounded-full text-label-lg ${
        onBlue ? 'bg-white text-primary' : 'bg-primary text-white'
      }`}
    >
      {user.full_name.trim()[0]?.toUpperCase()}
    </Link>
  )
}

/** Desktop header: logo, search, report button and account. */
function DesktopHeader() {
  return (
    <header className="hidden h-16 shrink-0 items-center gap-6 bg-primary px-6 text-white lg:flex">
      <Link to="/" aria-label="Sarathi home">
        <Logo onBlue className="h-9" />
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
        <Logo className="h-8" />
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

/** Whether the current page is drawn over the map on phones (route handle `{ map: true }`). */
function useMapPage(): boolean {
  return useMatches().some((match) => (match.handle as { map?: boolean } | undefined)?.map)
}

// Heights of the phone's bottom sheet; the map buttons and Leaflet's scale and credits sit just above it.
const SHEET_HEIGHTS: Record<SheetState, string> = {
  peek: '[--sheet-height:40dvh]',
  expanded: '[--sheet-height:78dvh]',
}

/**
 * The frame around every page. Desktop: side navigation, a 400 px page panel and the map. Phones: map pages sit in
 * a bottom sheet over the map, other pages fill the screen. The map stays loaded throughout, so it never reloads.
 */
export function AppShell() {
  const mapPage = useMapPage()
  const { pathname } = useLocation()
  const [sheet, setSheet] = useState<SheetState>('peek')
  const [sheetPath, setSheetPath] = useState(pathname)
  if (sheetPath !== pathname) {  // each new page starts with the sheet lowered
    setSheetPath(pathname)
    setSheet('peek')
  }

  return (
    <div className="flex h-dvh flex-col">
      <DesktopHeader />
      <MobileHeader />
      <div className={`relative flex min-h-0 flex-1 lg:[--sheet-height:0px] ${
        mapPage ? SHEET_HEIGHTS[sheet] : '[--sheet-height:0px]'}`}>
        <SideNav />
        <main
          data-map-sheet={mapPage || undefined}
          className={`min-w-0 lg:static lg:z-auto lg:flex lg:h-auto lg:w-100 lg:flex-none lg:flex-col lg:rounded-none lg:border-r lg:border-border-muted lg:shadow-none ${
            mapPage
              ? 'absolute inset-x-0 bottom-0 z-10 flex h-(--sheet-height) flex-col rounded-t-sheet bg-surface-container-lowest shadow-[0_-4px_16px_rgb(27_28_30/0.12)] transition-[height] duration-200'
              : 'flex-1 overflow-y-auto'
          }`}
        >
          {mapPage && <SheetHandle state={sheet} onChange={setSheet} />}
          <div className={mapPage ? 'min-h-0 flex-1 overflow-y-auto px-4 pb-5 lg:px-6 lg:py-5' : 'px-4 py-5 lg:px-6'}>
            <Outlet />
          </div>
        </main>
        <section aria-label="Map" className={`${mapPage ? 'absolute inset-0' : 'hidden'} lg:relative lg:block lg:flex-1`}>
          <MapView />
        </section>
      </div>
      <BottomNav />
    </div>
  )
}
