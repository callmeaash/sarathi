import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { HEALTHY, mockApi, renderApp } from '../test/render'

// The test page has no layout, so give the area under the header a phone-like height: snaps at 132, 288, 528 px.
const AREA = 600

let clock = 0
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(AREA)
  clock = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})
afterEach(() => vi.restoreAllMocks())

const handle = () => screen.getByRole('button', { name: /(Expand|Collapse) panel/ })
const sheetHeight = () => {
  const area = document.querySelector<HTMLElement>('[data-sheet]')!
  return area.style.getPropertyValue('--sheet-height')
}

/** Press on the handle at y, move to each y in turn (100 ms apart), and let go at the last. */
function drag(...ys: number[]) {
  const [first, ...rest] = ys
  fireEvent.pointerDown(handle(), { clientY: first, pointerId: 1 })
  for (const y of rest) {
    clock += 100
    fireEvent.pointerMove(handle(), { clientY: y, pointerId: 1 })
  }
  fireEvent.pointerUp(handle(), { clientY: rest.at(-1) ?? first, pointerId: 1 })
}

describe('phone bottom sheet', () => {
  beforeEach(() => { mockApi({ '/api/health': HEALTHY }) })

  it('starts at half height', () => {
    renderApp('/hazards')
    expect(sheetHeight()).toBe('288px')
    expect(handle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens low on Explore, so the map has most of the screen', () => {
    renderApp('/')
    expect(sheetHeight()).toBe('132px')
  })

  it('follows the finger while dragging', () => {
    renderApp('/hazards')
    fireEvent.pointerDown(handle(), { clientY: 500, pointerId: 1 })
    clock += 100
    fireEvent.pointerMove(handle(), { clientY: 420, pointerId: 1 })
    expect(sheetHeight()).toBe('368px')
    expect(document.querySelector('[data-dragging]')).not.toBeNull()
  })

  it('settles at the nearest height after a slow drag', () => {
    renderApp('/hazards')
    drag(500, 450, 400)          // up 100 px over 200 ms: 388 px, nearer half (288) than full (528)
    expect(sheetHeight()).toBe('288px')
    drag(500, 420, 340)          // up 160 px: 448 px, nearer full
    expect(sheetHeight()).toBe('528px')
    expect(handle()).toHaveAttribute('aria-expanded', 'true')
    expect(document.querySelector('[data-dragging]')).toBeNull()
  })

  it('goes to the next height on a quick flick', () => {
    renderApp('/hazards')
    fireEvent.pointerDown(handle(), { clientY: 500, pointerId: 1 })
    clock += 40
    fireEvent.pointerMove(handle(), { clientY: 470, pointerId: 1 })
    fireEvent.pointerUp(handle(), { clientY: 470, pointerId: 1 })  // 30 px in 40 ms: a flick up
    expect(sheetHeight()).toBe('528px')
  })

  it('never shrinks below a strip with the handle', () => {
    renderApp('/hazards')
    fireEvent.pointerDown(handle(), { clientY: 300, pointerId: 1 })
    clock += 100
    fireEvent.pointerMove(handle(), { clientY: 900, pointerId: 1 })
    expect(sheetHeight()).toBe('64px')
  })

  it('steps up on a tap and with the arrow keys', () => {
    renderApp('/hazards')
    drag(500)                    // a tap
    expect(sheetHeight()).toBe('528px')
    drag(500)                    // tapping at the top goes back to half
    expect(sheetHeight()).toBe('288px')
    fireEvent.keyDown(handle(), { key: 'ArrowDown' })
    expect(sheetHeight()).toBe('132px')
    fireEvent.keyDown(handle(), { key: 'ArrowUp' })
    expect(sheetHeight()).toBe('288px')
  })
})
