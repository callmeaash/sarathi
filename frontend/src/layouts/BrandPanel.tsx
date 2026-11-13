import { Link } from 'react-router'

import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { FEATURES } from './brand'

// Fixed when the page loads; good enough for a copyright line.
const YEAR = new Date().getFullYear()

/** Faint ring road and river lines behind the brand areas, in the brand blue on a light background. */
export function MapLines({ className = 'text-primary' }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className}`}>
      <ellipse cx="330" cy="430" rx="420" ry="330" fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth="18" strokeDasharray="2 26" strokeLinecap="round" />
      <path d="M-40 300 C 120 360, 180 520, 330 560 S 560 600, 660 720" fill="none" stroke="currentColor" strokeOpacity=".10" strokeWidth="26" strokeLinecap="round" />
      <path d="M40 -20 L 90 920 M 480 -20 L 430 920 M -20 180 L 640 140 M -20 760 L 640 700" stroke="currentColor" strokeOpacity=".08" strokeWidth="6" />
    </svg>
  )
}

/** Left half of the desktop sign-in screens: what Sarathi does. The welcome screen uses the Nepali-first logo. */
export function BrandPanel({ logo = 'horizontal' }: { logo?: 'horizontal' | 'nepali' }) {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border-muted bg-surface-tint-light p-14 lg:flex">
      <MapLines />
      {/* Fades the lines out towards the text, so it stays easy to read. */}
      <div className="absolute inset-0 bg-linear-to-t from-surface-tint-light via-surface-tint-light/80 to-transparent" aria-hidden />
      <Link to="/" aria-label="Sarathi home" className="relative self-start">
        <Logo variant={logo} className="h-14" />
      </Link>
      <div className="relative max-w-md">
        <h2 className="text-display-lg text-on-surface">Find open roads in Kathmandu</h2>
        <p className="mt-4 text-body-lg text-on-surface-variant">
          Verified road closures, routes around them, and the nearest hospital by road.
        </p>
        <ul className="mt-10 space-y-6">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="flex items-start gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-white">
                <Icon name={feature.icon} className="text-[20px]" />
              </span>
              <span>
                <span className="block text-title-md text-on-surface">{feature.title}</span>
                <span className="block text-body-md text-text-secondary">{feature.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-body-sm text-text-secondary">
        © {YEAR} Sarathi · Map data © OpenStreetMap contributors
      </p>
    </aside>
  )
}
