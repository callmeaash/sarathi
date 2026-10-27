import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: string
  subtitle?: ReactNode
}

/** A page's heading, which also sets the browser tab title. */
export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="mb-4">
      <title>{`${title} · Sarathi`}</title>
      <h1 className="text-headline-md text-on-surface">{title}</h1>
      {subtitle && <p className="mt-1 text-body-md text-text-secondary">{subtitle}</p>}
    </header>
  )
}
