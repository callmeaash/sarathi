import type { ButtonHTMLAttributes } from 'react'

import { Icon } from '../Icon'
import { type ButtonVariant, buttonClass } from './buttonStyles'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  full?: boolean
  icon?: string
  loading?: boolean
}

/** Pill button; while loading it shows a spinner and ignores clicks. */
export function Button({ variant = 'primary', full = false, icon, loading = false, disabled, children, className = '',
  type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${buttonClass(variant, full)} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : (
        icon && <Icon name={icon} className="text-[20px]" />
      )}
      {children}
    </button>
  )
}
