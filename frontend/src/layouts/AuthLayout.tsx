import { Link, Outlet, useNavigate } from 'react-router'

import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { BrandPanel } from './BrandPanel'

/** Back arrow and logo above the form on phones. */
function TopBar() {
  const navigate = useNavigate()
  // Go back within the app if we came from it; otherwise to the map.
  const back = () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))
  return (
    <div className="flex h-14 items-center justify-between lg:hidden">
      <button type="button" onClick={back} aria-label="Back"
        className="-ml-2 grid size-10 place-items-center rounded-full hover:bg-surface-container">
        <Icon name="arrow_back" />
      </button>
      <Link to="/" aria-label="Sarathi home">
        <Logo showName={false} />
      </Link>
    </div>
  )
}

/** Sign-in screens: the brand panel on the left on desktop, the form on its own on phones. */
export function AuthLayout() {
  return (
    <div className="min-h-dvh bg-surface-container-lowest lg:grid lg:grid-cols-[46%_1fr]">
      <BrandPanel />
      <main className="relative flex min-h-dvh flex-col px-4 pb-10 sm:px-8 lg:items-center lg:justify-center lg:px-12">
        <TopBar />
        {/* Desktop has no top bar, so the way back to the map sits above the form. */}
        <Link
          to="/"
          className="absolute top-8 left-12 hidden items-center gap-2 rounded-full px-3 py-2 text-label-lg text-primary hover:bg-surface-tint-light lg:inline-flex"
        >
          <Icon name="arrow_back" className="text-[20px]" />
          Back to map
        </Link>
        <div className="mx-auto w-full max-w-105 pt-4 lg:pt-0">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
