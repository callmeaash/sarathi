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

/**
 * Desktop: the same kind of street map, drawn wide, behind the whole sign-in screen. It fades a little on the
 * left, behind the brand text; the form on the right sits on a white card.
 */
export function AuthBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden text-primary lg:block">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
        <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          {/* River */}
          <path d="M-40 240 C 260 300, 420 520, 760 560 S 1320 600, 1660 780" strokeOpacity=".13" strokeWidth="38" />
          {/* Side streets */}
          <g strokeOpacity=".2" strokeWidth="3">
            <path d="M-20 95 L 1620 55 M -20 255 L 1620 205 M -20 430 L 1620 385 M -20 600 L 1620 550 M -20 850 L 1620 790" />
            <path d="M150 -20 L 195 920 M 320 -20 L 350 920 M 520 -20 L 495 920 M 700 -20 L 725 920 M 900 -20 L 870 920 M 1090 -20 L 1120 920 M 1280 -20 L 1250 920 M 1470 -20 L 1500 920" />
            <path d="M60 330 L 250 470 L 230 650 M 560 110 L 640 300 L 820 360 M 980 640 L 1130 770 L 1330 750 M 1180 120 L 1330 250 L 1560 280 M 380 690 L 600 770" />
          </g>
          {/* Main roads */}
          <g strokeOpacity=".24" strokeWidth="8">
            <path d="M40 -20 L 100 920" />
            <path d="M620 -20 L 580 920" />
            <path d="M1380 -20 L 1340 920" />
            <path d="M-20 170 L 1620 125" />
            <path d="M-20 725 L 1620 660" />
          </g>
          {/* Ring road, with its centre line */}
          <ellipse cx="800" cy="450" rx="700" ry="390" strokeOpacity=".26" strokeWidth="16" />
          <ellipse cx="800" cy="450" rx="700" ry="390" stroke="#fff" strokeOpacity=".85" strokeWidth="2" strokeDasharray="10 14" />
        </g>
      </svg>
      <div className="absolute inset-0 bg-linear-to-r from-surface-tint-light/80 via-surface-tint-light/35 to-transparent" />
    </div>
  )
}

/** Left half of the desktop sign-in screens: what Sarathi does. The welcome screen uses the Nepali-first logo. */
export function BrandPanel({ logo = 'horizontal' }: { logo?: 'horizontal' | 'nepali' }) {
  return (
    <aside className="relative hidden flex-col justify-between p-14 lg:flex">
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
