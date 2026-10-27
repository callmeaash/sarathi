import { useEffect } from 'react'
import { Link } from 'react-router'

import { Icon } from '../../components/Icon'
import { buttonClass } from '../../components/form/buttonStyles'
import { BrandMark, BrandPanel, MapLines } from '../../layouts/BrandPanel'
import { FEATURES } from '../../layouts/brand'
import { markWelcomed } from './welcomed'

const FEATURE_TINTS = ['bg-error-container text-hazard-closure-red', 'bg-[#fde4e8] text-facility-hospital-pink',
  'bg-[#fff1d6] text-hazard-works-amber']

/** The three ways to continue. */
function Choices() {
  return (
    <div className="space-y-3">
      <Link to="/signup" className={buttonClass('primary', true)}>Create account</Link>
      <Link to="/login" className={buttonClass('tonal', true)}>Log in</Link>
      <Link to="/" className={buttonClass('text', true)}>Continue without an account</Link>
    </div>
  )
}

/** Screen 1: first-visit introduction with sign-up, log-in, or straight to the map. */
export function WelcomePage() {
  useEffect(markWelcomed, [])

  return (
    <div className="min-h-dvh bg-surface-container-lowest lg:grid lg:grid-cols-[46%_1fr]">
      <title>Welcome · Sarathi</title>
      <BrandPanel />

      {/* Phones: blue introduction on top, choices below */}
      <div className="lg:hidden">
        <section className="relative overflow-hidden bg-primary px-6 pt-10 pb-8 text-white">
          <MapLines />
          <div className="relative">
            <BrandMark />
            <h1 className="mt-8 text-display-lg-mobile">Find open roads in Kathmandu</h1>
            <p className="mt-3 text-body-lg text-white/85">
              Verified road closures, routes around them, and the nearest hospital by road.
            </p>
          </div>
        </section>
        <div className="px-6 py-8">
          <ul className="grid grid-cols-3 gap-3 text-center">
            {FEATURES.map((feature, index) => (
              <li key={feature.title}>
                <span className={`mx-auto grid size-14 place-items-center rounded-full ${FEATURE_TINTS[index]}`}>
                  <Icon name={feature.icon} />
                </span>
                <span className="mt-2 block text-label-lg text-on-surface">{feature.title}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10"><Choices /></div>
          <p className="mt-8 text-center text-body-sm text-text-secondary">Map data © OpenStreetMap contributors</p>
        </div>
      </div>

      {/* Desktop: the brand panel tells the story; the choices sit on the right */}
      <main className="hidden min-h-dvh items-center justify-center px-12 lg:flex">
        <div className="w-full max-w-105">
          <h1 className="text-headline-lg">Welcome to Sarathi</h1>
          <p className="mt-2 mb-8 text-body-lg text-text-secondary">
            Create an account to report hazards, or explore the map without one.
          </p>
          <Choices />
        </div>
      </main>
    </div>
  )
}
