import { useState } from 'react'

import { Icon } from '../Icon'
import { TextField, type TextFieldProps } from './TextField'

/** Password input with a show/hide toggle. */
export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="grid size-10 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container"
        >
          <Icon name={visible ? 'visibility_off' : 'visibility'} className="text-[20px]" />
        </button>
      }
    />
  )
}
