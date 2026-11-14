import { Link } from 'react-router'

import { Icon } from '../components/Icon'
import { Logo } from '../components/Logo'
import { FEATURES } from './brand'

// Fixed when the page loads; good enough for a copyright line.
const YEAR = new Date().getFullYear()

/** A stylised street map behind the brand areas: a river, the ring road, main roads and side streets, in teal. */
export function MapLines({ className = 'text-primary' }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 900" preserveAspectRatio="xMidYMid slice" aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className}`}>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {/* River */}
        <path d="M-40 250 C 110 320, 170 500, 330 545 S 560 600, 660 730" strokeOpacity=".13" strokeWidth="34" />
        {/* Side streets */}
        <g strokeOpacity=".2" strokeWidth="3">
          <path d="M-20 90 L 640 60 M -20 250 L 640 215 M -20 420 L 640 390 M -20 590 L 640 555 M -20 840 L 640 790" />
          <path d="M150 -20 L 190 920 M 270 -20 L 300 920 M 385 -20 L 350 920 M 560 -20 L 520 920" />
          <path d="M60 330 L 230 470 L 215 640 M 400 120 L 470 300 L 610 360 M 330 660 L 470 780 L 640 760 M 95 700 L 235 760" />
        </g>
        {/* Main roads */}
        <g strokeOpacity=".24" strokeWidth="8">
          <path d="M40 -20 L 95 920" />
          <path d="M480 -20 L 430 920" />
          <path d="M-20 170 L 640 135" />
          <path d="M-20 720 L 640 665" />
        </g>
        {/* Ring road, with its centre line */}
        <ellipse cx="330" cy="430" rx="400" ry="320" strokeOpacity=".26" strokeWidth="16" />
        <ellipse cx="330" cy="430" rx="400" ry="320" stroke="#fff" strokeOpacity=".85" strokeWidth="2" strokeDasharray="10 14" />
      </g>
    </svg>
  )
}

/** Left half of the desktop sign-in screens: what Sarathi does. The welcome screen uses the Nepali-first logo. */
export function BrandPanel({ logo = 'horizontal' }: { logo?: 'horizontal' | 'nepali' }) {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-border-muted bg-surface-tint-light p-14 lg:flex">
      <MapLines />
      {/* Softens the map a little behind the text, so the text stays easy to read. */}
      <div className="absolute inset-0 bg-linear-to-t from-surface-tint-light/85 via-surface-tint-light/45 to-transparent" aria-hidden />
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
