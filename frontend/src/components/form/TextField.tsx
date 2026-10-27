import { type InputHTMLAttributes, type ReactNode, useId } from 'react'

import { Icon } from '../Icon'

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  icon?: string
  error?: string
  hint?: ReactNode
  trailing?: ReactNode
}

/** Outlined text input with its label on the border, an optional icon, and a hint or error below. */
export function TextField({ label, icon, error, hint, trailing, id, className = '', ...input }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const noteId = `${inputId}-note`
  const note = error ?? hint
  return (
    <div className={className}>
      <div
        className={`relative flex h-14 items-center gap-3 rounded-md border bg-surface-container-lowest px-4 transition-colors ${
          error
            ? 'border-error focus-within:ring-1 focus-within:ring-error'
            : 'border-border-muted focus-within:border-primary focus-within:ring-1 focus-within:ring-primary'
        }`}
      >
        <label
          htmlFor={inputId}
          className={`absolute -top-2 left-3 bg-surface-container-lowest px-1 text-label-sm ${
            error ? 'text-error' : 'text-on-surface-variant'
          }`}
        >
          {label}
        </label>
        {icon && <Icon name={icon} className="text-[20px] text-on-surface-variant" />}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-body-lg text-on-surface outline-none placeholder:text-outline focus-visible:outline-none"
          {...input}
        />
        {trailing}
      </div>
      {note && (
        <div id={noteId} className={`mt-1 px-4 text-body-sm ${error ? 'text-error' : 'text-text-secondary'}`}>
          {note}
        </div>
      )}
    </div>
  )
}
