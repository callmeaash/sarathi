import { type CSSProperties, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatches } from 'react-router'

import { useAuth } from '../auth/context'
import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { useHazardAlert } from '../hazards/useHazardAlert'
import { HeaderSearch } from '../search/HeaderSearch'
import { useAppMap } from '../map/context'
import { MapView } from '../map/MapView'
import { DESKTOP_NAV, MOBILE_NAV } from './navigation'
import { SheetHandle } from './SheetHandle'
import { type SheetLevel, useBottomSheet } from './useBottomSheet'
import { useIsDesktop } from './useIsDesktop'

/** The user's initial linking to their account, or a log-in button; shown in both headers. */
function AccountButton({ compact = false }: { compact?: boolean }) {
  const { status, user } = useAuth()
  if (status === 'loading') return <span className="size-10" aria-hidden />
  if (!user && compact) {
    return (
      <Link to="/login" aria-label="Log in"
        className="grid size-9 shrink-0 place-items-center rounded-md text-text-secondary hover:bg-surface hover:text-on-surface">
        <Icon name="person" className="text-[20px]" />
      </Link>
    )
  }
  if (!user) {
    return (
      <Link
        to="/login"
        className="flex h-9 items-center gap-2 rounded-md border border-border-muted bg-surface-container-lowest px-3.5 text-label-lg text-on-surface hover:bg-surface"
      >
        <Icon name="person" className="text-[18px]" />
        Log in
      </Link>
    )
  }
  return (
    <Link
      to="/account"
      aria-label={`Account: ${user.full_name}`}
      className={`grid shrink-0 place-items-center rounded-full bg-primary text-label-lg text-white ${compact ? 'size-8' : 'size-9'}`}
    >
      {user.full_name.trim()[0]?.toUpperCase()}
    </Link>
  )
}

/** Desktop header: logo, search, report button and account. */
function DesktopHeader() {
  const { user } = useAuth()
  return (
    <header className="relative z-30 hidden h-14 shrink-0 items-center gap-4 border-b border-border-muted bg-surface-container-lowest px-4 lg:flex">
      <Link to="/" aria-label="Sarathi home" className="min-w-60">
        <Logo className="h-8" />
      </Link>
      <div className="flex flex-1 justify-center">
        <div className="w-full max-w-130"><HeaderSearch variant="desktop" /></div>
      </div>
      <div className="flex min-w-60 items-center justify-end gap-2">
        {user?.role === 'moderator' && (
          <Link to="/moderation" className="flex h-9 items-center gap-2 rounded-md border border-border-muted bg-surface-container-lowest px-3.5 text-label-lg text-on-surface hover:bg-surface">
            <Icon name="shield_person" className="text-[18px]" />
            Moderate
          </Link>
        )}
        <Link
          to="/report"
          className="flex h-9 items-center gap-2 rounded-md bg-hazard-closure-red px-3.5 text-label-lg text-white hover:bg-[#b91c1c]"
        >
          <Icon name="warning" className="text-[18px]" />
          Report hazard
        </Link>
        <AccountButton />
      </div>
    </header>
  )
}

/** Phone header: logo and account. */
function MobileHeader() {
  return (
    <header className="relative z-20 shrink-0 border-b border-border-muted bg-surface-container-lowest px-5 pt-safe lg:hidden">
      <div className="flex h-14 items-center justify-between">
        <Link to="/" aria-label="Sarathi home">
          <Logo className="h-8" />
        </Link>
        <AccountButton />
      </div>
    </header>
  )
}

/** Phone map pages: a search pill (app icon, search, account) and the page's chips, floating over the map. */
function FloatingHeader({ measure }: { measure: (node: HTMLElement | null) => void }) {
  const { setHeaderSlot } = useAppMap()
  return (
    <header ref={measure} data-map-header className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 pt-safe lg:hidden">
      <div className="pointer-events-auto flex h-12 items-center gap-1 rounded-xl border border-border-muted bg-surface-container-lowest pr-1.5 pl-2 shadow-float">
        <Link to="/" aria-label="Sarathi home" className="shrink-0">
          <Logo variant="icon" className="size-8" />
        </Link>
        <div className="min-w-0 flex-1"><HeaderSearch variant="phone" /></div>
        <AccountButton compact />
      </div>
      <div ref={setHeaderSlot} className="pointer-events-auto mt-2 empty:hidden" />
    </header>
  )
}

/** Desktop side navigation. */
function SideNav() {
  const alert = useHazardAlert()
  return (
    <nav aria-label="Main" className="hidden w-18 shrink-0 flex-col items-center gap-1 border-r border-border-muted bg-surface-container-lowest py-2.5 lg:flex">
      {DESKTOP_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `relative flex h-13 w-15 flex-col items-center justify-center gap-[3px] rounded-md text-center text-[10.5px] font-medium ${
              isActive ? 'bg-primary-fixed text-primary' : 'text-text-secondary hover:bg-surface hover:text-on-surface'
            }`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute top-3 bottom-3 -left-1.5 w-[3px] rounded-full bg-primary" aria-hidden />}
              <span className="relative">
                <Icon name={item.icon} className="text-[20px]" />
                {item.to === '/hazards' && alert && (
                  <span className={`absolute -top-0.5 -right-1 size-2 rounded-full ring-2 ring-surface-container-lowest ${
                    alert === 'closed' ? 'bg-hazard-closure-red' : 'bg-pending-amber'}`} aria-hidden />
                )}
              </span>
              {item.label}
              {item.to === '/hazards' && alert && (
                <span className="sr-only">{alert === 'closed' ? '(roads closed)' : '(reports waiting)'}</span>
              )}
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
      className="grid shrink-0 grid-cols-5 border-t border-border-muted bg-surface-container-lowest px-1 pb-safe lg:hidden"
    >
      {MOBILE_NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className="relative flex h-16 items-center justify-center">
          {({ isActive }) => (
            <>
              {isActive && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-primary" aria-hidden />}
              <span className={`flex h-13 w-full max-w-17 flex-col items-center justify-center gap-[3px] rounded-md text-[10.5px] font-medium ${
                isActive ? 'bg-primary-fixed text-primary' : 'text-text-secondary'}`}>
                <Icon name={item.icon} className="text-[20px]" />
                {item.label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

/** How far down the map the floating header reaches; updates when it changes size (e.g. a page adds chips). */
function useHeaderHeight(): [number, (node: HTMLElement | null) => void] {
  const [height, setHeight] = useState(0)
  const [node, setNode] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!node) return undefined
    const update = () => setHeight(Math.round(node.getBoundingClientRect().height + node.offsetTop))
    update()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return [node ? height : 0, setNode]
}

/** Whether the current page is drawn over the map on phones (route handle `{ map: true }`). */
function useMapPage(): boolean {
  return useMatches().some((match) => (match.handle as { map?: boolean } | undefined)?.map)
}

/**
 * The frame around every page. Desktop: side navigation, a 400 px page panel and the map. Phones: map pages sit in
 * a bottom sheet over the map, other pages fill the screen. The map stays loaded throughout, so it never reloads.
 */
export function AppShell() {
  const mapPage = useMapPage()
  const { pathname } = useLocation()
  const desktop = useIsDesktop()
  const startLevel = useMatches().map((m) => (m.handle as { sheet?: SheetLevel } | undefined)?.sheet).find(Boolean)
  const [mapTop, measureHeader] = useHeaderHeight()  // how much of the map's top the floating header covers
  const { attachArea, height, dragging, expanded, handle } = useBottomSheet(pathname, startLevel ?? 'half', mapTop)
  // --sheet-height tells the map buttons and Leaflet's scale and credits how far up to sit, live while dragging.
  const sheetStyle = mapPage && !desktop
    ? { '--sheet-height': `${height}px`, '--map-top': `${mapTop}px` } as CSSProperties : undefined

  return (
    <div className="flex h-dvh flex-col">
      <DesktopHeader />
      {!mapPage && <MobileHeader />}
      <div
        ref={attachArea}
        style={sheetStyle}
        data-sheet={mapPage ? (expanded ? 'expanded' : 'resting') : undefined}
        data-dragging={dragging || undefined}
        className={`relative flex min-h-0 flex-1 lg:[--sheet-height:0px] ${mapPage ? '' : '[--sheet-height:0px]'}`}
      >
        {mapPage && <FloatingHeader measure={measureHeader} />}
        <SideNav />
        <main
          data-map-sheet={mapPage || undefined}
          className={`min-w-0 lg:static lg:z-auto lg:flex lg:h-auto lg:w-100 lg:flex-none lg:flex-col lg:rounded-none lg:border-r lg:border-border-muted lg:shadow-none ${
            mapPage
              ? `absolute inset-x-0 bottom-0 z-10 flex h-(--sheet-height) flex-col rounded-t-sheet bg-surface-container-lowest shadow-[0_-8px_24px_rgb(15_23_42/0.15)] ${
                dragging ? '' : 'transition-[height] duration-200'}`
              : 'flex-1 overflow-y-auto'
          }`}
        >
          {mapPage && <SheetHandle expanded={expanded} handle={handle} />}
          <div className={mapPage ? 'min-h-0 flex-1 overflow-y-auto px-5 pb-5 lg:px-6 lg:py-5' : 'px-5 py-5 lg:px-6'}>
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
