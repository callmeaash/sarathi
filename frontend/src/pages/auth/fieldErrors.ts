import { ApiError, describeError } from '../../api/client'

export type FieldErrors<F extends string> = Partial<Record<F | 'form', string>>

/** Put an API error next to the field it is about (matched by words in the message), or above the form. */
export function errorsFrom<F extends string>(error: unknown, fields: Partial<Record<F, RegExp>>): FieldErrors<F> {
  const message = describeError(error)
  if (error instanceof ApiError && error.status === 422) {
    for (const [field, pattern] of Object.entries(fields) as [F, RegExp][]) {
      if (pattern.test(message)) return { [field]: message } as FieldErrors<F>
    }
  }
  return { form: message } as FieldErrors<F>
}

/** "in 12 minutes" style wording for a Retry-After value. */
export function waitWording(seconds: number | null): string {
  if (!seconds) return 'later'
  if (seconds < 90) return `in ${seconds} seconds`
  return `in ${Math.ceil(seconds / 60)} minutes`
}

export const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
