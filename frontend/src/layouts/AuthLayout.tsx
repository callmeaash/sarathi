import { Link, Outlet, useNavigate } from 'react-router'

import { Icon } from '../components/Icon'
import { LiveStatusChip } from '../components/LiveStatusChip'
import { BrandPanel } from './BrandPanel'

/** Phones: back button and live status above the form. */
function TopBar() {
  const navigate = useNavigate()
  // Go back within the app if we came from it; otherwise to the map.
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))
  return (
    <div className="flex h-16 items-center justify-between lg:hidden">
      <button type="button" onClick={back} aria-label="Back"
        className="grid size-10 place-items-center rounded-full bg-surface-container hover:bg-surface-container-high">
        <Icon name="arrow_back" className="text-[22px]" />
      </button>
      <LiveStatusChip />
    </div>
  )
}

/** Phones: app icon, name and what the app is for, where the desktop has the blue brand panel. */
function MobileBrand() {
  return (
    <Link to="/" aria-label="Sarathi home" className="mt-2 mb-8 flex items-center gap-3 self-start lg:hidden">
      <img src="/brand/svg/sarathi-icon.svg" alt="" className="size-14" />
      <span>
        <span className="flex items-center gap-2">
          <span className="text-title-md text-on-surface">Sarathi</span>
          <span lang="ne" className="rounded-full bg-surface-tint-medium px-2 py-0.5 font-devanagari text-label-md text-primary">
            सारथी
          </span>
        </span>
        <span className="block text-body-md text-text-secondary">Kathmandu road closures and safe routes</span>
      </span>
    </Link>
  )
}

/** Sign-in screens: the brand panel on the left on desktop; on phones one aligned column with the brand on top. */
export function AuthLayout() {
  return (
    <div className="min-h-dvh bg-surface lg:grid lg:grid-cols-[46%_1fr] lg:bg-surface-container-lowest">
      <BrandPanel />
      <main className="relative flex min-h-dvh flex-col px-5 sm:px-8 lg:items-center lg:justify-center lg:px-12">
        {/* Desktop has no top bar, so the way back to the map sits above the form. */}
        <Link
          to="/"
          className="absolute top-8 left-12 hidden items-center gap-2 rounded-full px-3 py-2 text-label-lg text-primary hover:bg-surface-tint-light lg:inline-flex"
        >
          <Icon name="arrow_back" className="text-[20px]" />
          Back to map
        </Link>
        <div className="mx-auto flex w-full max-w-105 flex-1 flex-col lg:flex-none">
          <TopBar />
          <MobileBrand />
          <Outlet />
          <footer className="mt-auto flex items-center justify-center gap-1.5 pt-12 pb-6 text-body-sm text-text-secondary lg:hidden">
            <Icon name="map" className="text-[16px]" />
            Map data © OpenStreetMap contributors
          </footer>
        </div>
      </main>
    </div>
  )
}
