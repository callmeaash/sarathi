import type { ReactNode } from 'react'

import { Icon } from './Icon'
import type { IconName } from './icons'

type Tone = 'error' | 'info' | 'success'

const TONES: Record<Tone, { box: string; icon: IconName }> = {
  error: { box: 'border-[#fecaca] bg-error-container text-on-error-container', icon: 'error' },
  info: { box: 'border-border-muted bg-surface text-on-surface-variant', icon: 'info' },
  success: { box: 'border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]', icon: 'check_circle' },
}

/** A message box; errors are announced to screen readers straight away. */
export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  const { box, icon } = TONES[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-md border px-3.5 py-3 text-body-md ${box}`}>
      <Icon name={icon} className="mt-px text-[20px]" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
