import type { ReactNode } from 'react'

import { Icon } from './Icon'

type Tone = 'error' | 'info' | 'success'

const TONES: Record<Tone, { box: string; icon: string }> = {
  error: { box: 'bg-error-container text-on-error-container', icon: 'error' },
  info: { box: 'bg-surface-tint-light text-on-surface', icon: 'info' },
  success: { box: 'bg-tertiary-fixed/50 text-on-surface', icon: 'check_circle' },
}

/** A message box; errors are announced to screen readers straight away. */
export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const { box, icon } = TONES[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-lg px-4 py-3 text-body-md ${box}`}>
      <Icon name={icon} className="mt-px text-[20px]" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
