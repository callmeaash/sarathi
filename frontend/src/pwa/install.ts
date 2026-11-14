import { useSyncExternalStore } from 'react'

// Installing Sarathi as an app. Chrome, Edge and Android browsers announce that the app can be installed with a
// "beforeinstallprompt" event, which is kept here until the user asks to install. Safari on iPhone has no such
// event: people add the app from the Share menu, so they are shown how instead.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
export type InstallState = 'unavailable' | 'ready' | 'ios' | 'installed'

let promptEvent: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

/** Whether the app is already running as an installed app (its own window, no browser bars). */
function standalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

/** Whether this is Safari on an iPhone or iPad, where installing is done from the Share menu. */
function iosSafari(): boolean {
  try {
    const agent = navigator.userAgent
    const ios = /iPad|iPhone|iPod/.test(agent) || (agent.includes('Macintosh') && navigator.maxTouchPoints > 1)
    return ios && !/CriOS|FxiOS|EdgiOS/.test(agent)
  } catch {
    return false  // a browser that won't say what it is gets no iPhone instructions
  }
}

/** Start listening for the browser's install events; called once when the app starts. */
export function watchInstall(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()  // keep the browser's own banner back; the app offers its own button
    promptEvent = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    promptEvent = null
    installed = true
    notify()
  })
}

/** Where installing stands for this browser. */
export function installState(): InstallState {
  if (installed || standalone()) return 'installed'
  if (promptEvent) return 'ready'
  return iosSafari() ? 'ios' : 'unavailable'
}

/** Show the browser's install dialog; resolves to whether the user accepted. */
export async function install(): Promise<boolean> {
  const event = promptEvent
  if (!event) return false
  await event.prompt()
  const { outcome } = await event.userChoice
  promptEvent = null  // a prompt can only be used once
  notify()
  return outcome === 'accepted'
}

/** Forget everything (used by tests). */
export function resetInstall(): void {
  promptEvent = null
  installed = false
  notify()
}

/** The install state, kept up to date. */
export function useInstallState(): InstallState {
  return useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, installState)
}

/** Keep the app's files on the device (production builds only), so it opens quickly and when offline. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)  // the app works without it
  })
}
