import type { ReactNode } from 'react'

import { Icon } from '../components/Icon'
import type { IconName } from '../components/icons'
import { hazardInfo } from '../hazards/kinds'
import { ACTION_LABELS } from './text'

/** A page's heading in the moderator panel, with room for controls on the right. */
export function PanelHeader({ title, tag, subtitle, children }: {
  title: string; tag?: ReactNode; subtitle?: ReactNode; children?: ReactNode
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <title>{`${title} · Moderator panel · Sarathi`}</title>
        <h1 className="flex flex-wrap items-center gap-2.5 text-headline-lg text-on-surface">{title}{tag}</h1>
        {subtitle && <p className="mt-1 text-body-md text-text-secondary">{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}

/** One number on a dashboard row. */
export function StatCard({ label, value, detail, icon, tone = 'neutral' }: {
  label: string; value: ReactNode; detail?: ReactNode; icon: IconName; tone?: 'neutral' | 'amber' | 'red' | 'green'
}) {
  const tones = {
    neutral: 'bg-surface-container text-on-surface-variant', amber: 'bg-[#fffbeb] text-[#b45309]',
    red: 'bg-error-container text-error', green: 'bg-[#f0fdf4] text-open-green',
  }
  return (
    <div className="rounded-xl border border-border-muted bg-surface-container-lowest p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-body-md text-text-secondary">{label}</p>
        <span className={`grid size-9 shrink-0 place-items-center rounded-md ${tones[tone]}`}><Icon name={icon} className="text-[20px]" /></span>
      </div>
      <p className={`mt-1 text-headline-lg tabular-nums ${tone === 'red' ? 'text-error' : 'text-on-surface'}`}>{value}</p>
      {detail && <p className="mt-0.5 text-body-sm text-text-secondary">{detail}</p>}
    </div>
  )
}

/** A panel card with an optional heading row. */
export function Card({ title, aside, children, className = '' }: {
  title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string
}) {
  return (
    <section aria-label={typeof title === 'string' ? title : undefined}
      className={`rounded-xl border border-border-muted bg-surface-container-lowest ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <h2 className="text-title-md text-on-surface">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  )
}

/** The round icon for a kind of hazard. */
export function HazardIcon({ kind, size = 'size-10' }: { kind: string; size?: string }) {
  const { icon, tint } = hazardInfo(kind)
  return <span className={`grid ${size} shrink-0 place-items-center rounded-md ${tint}`}><Icon name={icon} className="text-[20px]" /></span>
}

const STATUS_CHIPS: Record<string, { label: string; style: string }> = {
  pending: { label: 'Pending', style: 'bg-[#fffbeb] text-[#92400e]' },
  verified: { label: 'Road closed', style: 'bg-error-container text-on-error-container' },
  cleared: { label: 'Cleared', style: 'bg-[#f0fdf4] text-open-green' },
  rejected: { label: 'Rejected', style: 'bg-surface-container text-on-surface-variant' },
  merged: { label: 'Duplicate', style: 'bg-surface-container text-on-surface-variant' },
}

/** A report's status as a small pill. */
export function StatusChip({ status }: { status: string }) {
  const chip = STATUS_CHIPS[status] ?? STATUS_CHIPS.pending
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium ${chip.style}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />{chip.label}
    </span>
  )
}

const ACTIONS: Record<string, { label: string; style: string; icon: IconName }> = {
  verify: { label: ACTION_LABELS.verify, style: 'bg-error-container text-on-error-container', icon: 'verified' },
  reject: { label: ACTION_LABELS.reject, style: 'bg-surface-container text-on-surface-variant', icon: 'cancel' },
  clear: { label: ACTION_LABELS.clear, style: 'bg-[#f0fdf4] text-open-green', icon: 'check_circle' },
  merge: { label: ACTION_LABELS.merge, style: 'bg-surface-container text-on-surface-variant', icon: 'call_merge' },
  suspend: { label: ACTION_LABELS.suspend, style: 'bg-error-container text-on-error-container', icon: 'block' },
  reinstate: { label: ACTION_LABELS.reinstate, style: 'bg-[#f0fdf4] text-open-green', icon: 'check_circle' },
  role: { label: ACTION_LABELS.role, style: 'bg-primary-fixed text-on-primary-fixed', icon: 'shield_person' },
}

/** What a moderator did, as a small pill. */
export function ActionChip({ action }: { action: string }) {
  const chip = ACTIONS[action] ?? { label: action, style: 'bg-surface-container text-on-surface-variant', icon: 'info' as const }
  return (
    <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-medium ${chip.style}`}>
      <Icon name={chip.icon} className="text-[14px]" />{chip.label}
    </span>
  )
}

/** Placeholder for a list with nothing in it. */
export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-fixed text-primary"><Icon name={icon} className="text-[26px]" /></span>
      <p className="mt-3 text-title-md text-on-surface">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-body-md text-text-secondary">{children}</p>}
    </div>
  )
}
