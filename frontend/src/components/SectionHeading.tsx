import type { ReactNode } from 'react'

type SectionHeadingProps = { title: string; count?: number; aside?: ReactNode }

/** Small uppercase heading for a panel section, with an optional count and something on the right. */
export function SectionHeading({ title, count, aside }: SectionHeadingProps) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-label-md tracking-[0.08em] text-on-surface-variant uppercase">
        {title}
        {count !== undefined && (
          <span className="rounded-md bg-surface-container px-1.5 py-0.5 tracking-normal text-on-surface tabular-nums">
            {count}
          </span>
        )}
      </h2>
      {aside}
    </div>
  )
}

/** Card shown in place of an empty list. */
export function EmptyCard({ icon, tone, title, children, fill = false }: {
  icon: string; tone: 'ok' | 'info'; title: string; children: ReactNode; fill?: boolean
}) {
  // fill: on desktop, grow with the window height (within limits), content centred.
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-border-muted bg-surface-container-low px-3 py-2.5 ${
      fill ? 'lg:h-[clamp(3.5rem,12dvh,9rem)]' : ''}`}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${
        tone === 'ok' ? 'bg-tertiary-fixed/60 text-tertiary' : 'bg-surface-tint-medium text-primary'}`}>
        <span className="icon text-[18px]" aria-hidden>{icon}</span>
      </span>
      <div className="min-w-0">
        <p className="text-label-lg text-on-surface">{title}</p>
        <p className="text-body-sm text-text-secondary">{children}</p>
      </div>
    </div>
  )
}
