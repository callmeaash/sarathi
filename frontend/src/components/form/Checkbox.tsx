import { type InputHTMLAttributes, type ReactNode, useId } from 'react'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode
  error?: string
}

/** Checkbox with a clickable label and an optional error below. */
export function Checkbox({ label, error, id, ...input }: CheckboxProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div>
      <div className="flex items-start gap-3">
        <input
          id={inputId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className="mt-0.5 size-5 shrink-0 accent-primary"
          {...input}
        />
        <label htmlFor={inputId} className="text-body-md text-on-surface-variant">{label}</label>
      </div>
      {error && <p id={`${inputId}-error`} className="mt-1 pl-8 text-body-sm text-error">{error}</p>}
    </div>
  )
}
