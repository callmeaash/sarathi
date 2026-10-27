import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef } from 'react'

export const CODE_LENGTH = 6

type CodeInputProps = {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
}

/** Six boxes for an emailed code: typing moves along, backspace moves back, and paste or autofill fills them all. */
export function CodeInput({ value, onChange, onComplete, disabled, invalid, describedBy }: CodeInputProps) {
  const boxes = useRef<(HTMLInputElement | null)[]>([])
  const pendingFocus = useRef<number | null>(null)

  const focus = (index: number) => boxes.current[Math.max(0, Math.min(index, CODE_LENGTH - 1))]?.focus()

  // Move focus only once the new value is on screen; the boxes' focus rule depends on it.
  useEffect(() => {
    if (pendingFocus.current === null) return
    focus(pendingFocus.current)
    pendingFocus.current = null
  }, [value])

  const update = (next: string, focusIndex: number) => {
    if (next === value) return focus(focusIndex)
    pendingFocus.current = focusIndex
    onChange(next)
    if (next.length === CODE_LENGTH) onComplete?.(next)
    return undefined
  }

  // Digits are kept contiguous from the first box, which keeps editing predictable.
  const handleInput = (index: number, typed: string) => {
    const digits = typed.replace(/\D/g, '')
    if (typed === '') return update(value.slice(0, index), index)
    if (!digits) return undefined
    if (digits.length >= CODE_LENGTH) return update(digits.slice(0, CODE_LENGTH), CODE_LENGTH - 1)
    const next = (value.slice(0, index) + digits + value.slice(index + digits.length)).slice(0, CODE_LENGTH)
    return update(next, index + digits.length)
  }

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      event.preventDefault()
      update(value.slice(0, index - 1), index - 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focus(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focus(Math.min(index + 1, value.length))
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '')
    if (!digits) return
    event.preventDefault()
    const next = digits.slice(0, CODE_LENGTH)
    update(next, next.length)
  }

  return (
    <div role="group" aria-label="Verification code" aria-describedby={describedBy} className="flex gap-2 sm:gap-3">
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element
          }}
          value={value[index] ?? ''}
          onChange={(event) => handleInput(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => (index > value.length ? focus(value.length) : event.target.select())}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1} of ${CODE_LENGTH}`}
          aria-invalid={invalid || undefined}
          className={`h-14 w-full min-w-0 max-w-14 rounded-md border bg-surface-container-lowest text-center text-headline-md text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60 ${
            invalid ? 'border-error' : 'border-border-muted'
          }`}
        />
      ))}
    </div>
  )
}
