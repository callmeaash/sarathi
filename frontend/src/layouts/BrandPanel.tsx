import { Link } from 'react-router'

import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { FEATURES } from './brand'

// Fixed when the page loads; good enough for a copyright line.
const YEAR = new Date().getFullYear()

/** Faint ring road and river lines behind the blue brand areas. */
export function MapLines({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className}`}>
      <ellipse cx="330" cy="430" rx="420" ry="330" fill="none" stroke="white" strokeOpacity=".14" strokeWidth="18" strokeDasharray="2 26" strokeLinecap="round" />
      <path d="M-40 300 C 120 360, 180 520, 330 560 S 560 600, 660 720" fill="none" stroke="white" strokeOpacity=".12" strokeWidth="26" strokeLinecap="round" />
      <path d="M40 -20 L 90 920 M 480 -20 L 430 920 M -20 180 L 640 140 M -20 760 L 640 700" stroke="white" strokeOpacity=".07" strokeWidth="6" />
    </svg>
  )
}

/** Left half of the desktop sign-in screens: what Sarathi does. The welcome screen uses the Nepali-first logo. */
export function BrandPanel({ logo = 'horizontal' }: { logo?: 'horizontal' | 'nepali' }) {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-14 text-white lg:flex">
      <MapLines />
      <Link to="/" aria-label="Sarathi home" className="relative self-start">
        <Logo variant={logo} onBlue className="h-16" />
      </Link>
      <div className="relative max-w-md">
        <h2 className="text-display-lg">Find open roads in Kathmandu</h2>
        <p className="mt-4 text-body-lg text-white/85">
          Verified road closures, routes around them, and the nearest hospital by road.
        </p>
        <ul className="mt-10 space-y-6">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15">
                <Icon name={feature.icon} />
              </span>
              <span>
                <span className="block text-title-md">{feature.title}</span>
                <span className="block text-body-md text-white/80">{feature.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-body-sm text-white/70">
        © {YEAR} Sarathi · Map data © OpenStreetMap contributors
      </p>
    </aside>
  )
}
