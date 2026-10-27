import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { CodeInput } from './CodeInput'

function Harness({ onComplete }: { onComplete?: (code: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <>
      <CodeInput value={value} onChange={setValue} onComplete={onComplete} />
      <output>{value}</output>
    </>
  )
}

const boxes = () => screen.getAllByRole('textbox')

describe('CodeInput', () => {
  it('moves along as digits are typed and reports the full code once', async () => {
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<Harness onComplete={onComplete} />)
    await user.click(boxes()[0])
    await user.keyboard('48219')
    expect(boxes()[5]).toHaveFocus()
    await user.keyboard('0')
    expect(screen.getByRole('status')).toHaveTextContent('482190')
    expect(onComplete).toHaveBeenCalledExactlyOnceWith('482190')
  })

  it('ignores anything but digits', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(boxes()[0])
    await user.keyboard('a1-2 ')
    expect(screen.getByRole('status')).toHaveTextContent(/^12$/)
  })

  it('fills every box from a pasted code', async () => {
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<Harness onComplete={onComplete} />)
    await user.click(boxes()[0])
    await user.paste('482 190')
    expect(boxes().map((box) => (box as HTMLInputElement).value).join('')).toBe('482190')
    expect(onComplete).toHaveBeenCalledWith('482190')
  })

  it('steps back with backspace', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(boxes()[0])
    await user.keyboard('123{Backspace}{Backspace}')
    expect(screen.getByRole('status')).toHaveTextContent(/^1$/)
    expect(boxes()[1]).toHaveFocus()
  })

  it('keeps the digits together by sending focus to the first empty box', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(boxes()[4])
    expect(boxes()[0]).toHaveFocus()
  })

  it('labels each box for screen readers', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Verification code' })).toBeInTheDocument()
    expect(screen.getByLabelText('Digit 1 of 6')).toHaveAttribute('autocomplete', 'one-time-code')
  })
})
