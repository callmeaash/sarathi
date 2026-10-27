import type { ReactNode } from 'react'
import { Link, isRouteErrorResponse, useRouteError } from 'react-router'

import { Icon } from '../components/Icon'

type MessageProps = {
  icon: string
  title: string
  text: string
  action: ReactNode
}

/** Centred icon, heading, explanation and one action. */
function Message({ icon, title, text, action }: MessageProps) {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <title>{`${title} · Sarathi`}</title>
      <Icon name={icon} className="text-[48px] text-on-surface-variant" />
      <h1 className="mt-4 text-headline-sm">{title}</h1>
      <p className="mt-2 max-w-xs text-body-md text-text-secondary">{text}</p>
      <div className="mt-6">{action}</div>
    </div>
  )
}

const primaryButton = 'inline-flex h-12 items-center rounded-full bg-primary px-6 text-label-lg text-white hover:bg-primary-hover'

/** Shown for addresses that match no page. */
export function NotFoundPage() {
  return (
    <Message
      icon="wrong_location"
      title="Page not found"
      text="This page doesn't exist or has moved."
      action={<Link to="/" className={primaryButton}>Back to the map</Link>}
    />
  )
}

/** Shown when a page fails unexpectedly, inside the app frame so navigation still works. */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  return (
    <Message
      icon="error"
      title="Something went wrong"
      text="This page hit an unexpected problem. Reloading usually fixes it."
      action={<button type="button" onClick={() => window.location.reload()} className={primaryButton}>Reload</button>}
    />
  )
}
