import type { ReactNode } from 'react'

import { Icon } from '../../components/Icon'

type AuthHeadingProps = {
  title: string
  children?: ReactNode
  icon?: string
}

/** Title and short explanation at the top of a sign-in form; also sets the tab title. */
export function AuthHeading({ title, children, icon }: AuthHeadingProps) {
  return (
    <header className="mb-8">
      <title>{`${title} · Sarathi`}</title>
      {icon && (
        <span className="mb-5 grid size-16 place-items-center rounded-full bg-primary-fixed text-primary">
          <Icon name={icon} className="text-[30px]" />
        </span>
      )}
      <h1 className="text-headline-lg text-on-surface">{title}</h1>
      {children && <p className="mt-2 text-body-lg text-text-secondary">{children}</p>}
    </header>
  )
}
