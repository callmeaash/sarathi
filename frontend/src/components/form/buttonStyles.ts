export type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'text' | 'danger'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border-muted bg-surface-container-lowest text-on-surface hover:bg-surface-container-low',
  tonal: 'bg-surface-tint-light text-primary hover:bg-surface-tint-medium',
  text: 'text-primary hover:bg-surface-tint-light',
  danger: 'bg-hazard-closure-red text-white hover:brightness-110',
}

/** Classes for a pill button, shared by <Button> and links that look like buttons. */
export function buttonClass(variant: ButtonVariant = 'primary', full = false): string {
  return `inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-label-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    full ? 'w-full' : ''
  } ${VARIANTS[variant]}`
}
