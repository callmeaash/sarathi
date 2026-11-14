import { Link, Outlet, useNavigate } from 'react-router'

import { Icon } from '../components/Icon'
import { LiveStatusChip } from '../components/LiveStatusChip'
import { Logo } from '../components/Logo'
import { AuthBackdrop, BrandPanel } from './BrandPanel'

/** Phones: back button and live status above the form. */
function TopBar() {
  const navigate = useNavigate()
  // Go back within the app if we came from it; otherwise to the map.
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))
  return (
    <div className="flex h-16 items-center justify-between pt-safe lg:hidden">
      <button type="button" onClick={back} aria-label="Back"
        className="grid size-10 place-items-center rounded-md border border-border-muted bg-surface-container-lowest hover:bg-surface">
        <Icon name="arrow_back" className="text-[20px]" />
      </button>
      <LiveStatusChip />
    </div>
  )
}

/** Phones: app icon, name and what the app is for, where the desktop has the brand panel. */
function MobileBrand() {
  return (
    <div className="mb-8 lg:hidden">
      <Link to="/" aria-label="Sarathi home" className="inline-block">
        <Logo className="h-12" />
      </Link>
      <p className="mt-2 text-body-md text-text-secondary">Kathmandu road closures and safe routes</p>
    </div>
  )
}

/**
 * Sign-in screens. Desktop: a street map behind everything, what Sarathi does on the left, and the form on a
 * white card on the right. Phones: one aligned column with the brand on top.
 */
export function AuthLayout() {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-surface lg:grid lg:grid-cols-[46%_1fr] lg:bg-surface-tint-light">
      <AuthBackdrop />
      <BrandPanel />
      <main className="relative flex min-h-dvh flex-col px-5 sm:px-8 lg:items-center lg:justify-center lg:px-12">
        <div className="mx-auto flex w-full max-w-105 flex-1 flex-col lg:flex-none lg:max-w-[31rem] lg:rounded-2xl lg:border lg:border-border-muted lg:bg-surface-container-lowest lg:p-10 lg:shadow-(--shadow-modal)">
          <TopBar />
          {/* Desktop has no top bar, so the way back to the map sits at the top of the card. */}
          <Link to="/" className="-mt-2 mb-5 -ml-2 hidden items-center gap-2 self-start rounded-md px-2 py-1.5 text-label-lg text-primary hover:bg-surface-container lg:inline-flex">
            <Icon name="arrow_back" className="text-[20px]" />
            Back to map
          </Link>
          {/* my-auto centres the brand and form between the top bar and the footer on tall phones. */}
          <div className="my-auto flex flex-col py-6 lg:py-0">
            <MobileBrand />
            <Outlet />
          </div>
          <footer className="flex items-center justify-center gap-1.5 pt-6 pb-6 text-body-sm text-text-secondary lg:hidden">
            <Icon name="map" className="text-[16px]" />
            Map data © OpenStreetMap contributors
          </footer>
        </div>
      </main>
    </div>
  )
}
