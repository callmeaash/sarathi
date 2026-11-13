import { type InputHTMLAttributes, type ReactNode, useId } from 'react'

import { Icon } from '../Icon'
import type { IconName } from '../icons'

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  icon?: IconName
  error?: string
  hint?: ReactNode
  trailing?: ReactNode
}

/** Text input with its label above, an optional icon, and a hint or error below. */
export function TextField({ label, icon, error, hint, trailing, id, className = '', ...input }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const noteId = `${inputId}-note`
  const note = error ?? hint
  return (
    <div className={className}>
      <label htmlFor={inputId} className={`mb-1.5 block text-[12.5px] font-medium ${error ? 'text-error' : 'text-on-surface'}`}>
        {label}
      </label>
      <div
        className={`flex h-11 items-center gap-2.5 rounded-md border bg-surface-container-lowest px-3 transition-shadow ${
          error
            ? 'border-error focus-within:ring-[3px] focus-within:ring-error/15'
            : 'border-border-muted focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15'
        }`}
      >
        {icon && <Icon name={icon} className="text-[20px] text-on-surface-variant" />}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-body-md text-on-surface outline-none placeholder:text-[#94a3b8] focus-visible:outline-none"
          {...input}
        />
        {trailing}
      </div>
      {note && (
        <div id={noteId} className={`mt-1.5 text-body-sm ${error ? 'text-error' : 'text-text-secondary'}`}>
          {note}
        </div>
      )}
    </div>
  )
}
