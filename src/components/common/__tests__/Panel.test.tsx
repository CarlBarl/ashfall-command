import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Panel from '../Panel'
import { useUIStore } from '@/store/ui-store'

const ABS = { position: 'absolute', top: 44, left: 12 } as const

// jsdom rects are all zeros, which the drag-end clamp would misread as off-screen
function stubRect(el: HTMLElement, rect: Partial<DOMRect> = {}) {
  el.getBoundingClientRect = () => ({
    x: 100, y: 100, top: 100, left: 100, right: 400, bottom: 300, width: 300, height: 200,
    toJSON: () => ({}),
    ...rect,
  }) as DOMRect
}

function titleBar(title: string): HTMLElement {
  return screen.getByText(title).parentElement!
}

function panelEl(title: string): HTMLElement {
  return titleBar(title).parentElement!
}

beforeEach(() => {
  useUIStore.setState({ panelOffsets: {}, panelRegistry: {}, panelFocusCounter: 0 })
})

describe('Panel dragging', () => {
  it('drags via the title bar, applies a translate, and persists the offset across remount', () => {
    const first = render(<Panel title="TEST PANEL" style={ABS}>body</Panel>)
    stubRect(first.container.firstChild as HTMLElement)

    expect(titleBar('TEST PANEL').style.cursor).toBe('grab')
    fireEvent.pointerDown(titleBar('TEST PANEL'), { clientX: 200, clientY: 100 })
    expect(titleBar('TEST PANEL').style.cursor).toBe('grabbing')

    fireEvent.pointerMove(window, { clientX: 250, clientY: 130 })
    expect((first.container.firstChild as HTMLElement).style.transform).toBe('translate(50px, 30px)')

    fireEvent.pointerUp(window, { clientX: 250, clientY: 130 })
    expect(titleBar('TEST PANEL').style.cursor).toBe('grab')
    expect(useUIStore.getState().panelOffsets['TEST PANEL']).toEqual({ dx: 50, dy: 30 })

    first.unmount()
    const second = render(<Panel title="TEST PANEL" style={ABS}>body</Panel>)
    expect((second.container.firstChild as HTMLElement).style.transform).toBe('translate(50px, 30px)')
  })

  it('composes the drag translate with the consumer transform', () => {
    const { container } = render(
      <Panel title="CENTERED" style={{ position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)' }}>body</Panel>,
    )
    stubRect(container.firstChild as HTMLElement)

    fireEvent.pointerDown(titleBar('CENTERED'), { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 10, clientY: 5 })
    fireEvent.pointerUp(window)

    expect((container.firstChild as HTMLElement).style.transform).toBe('translateX(-50%) translate(10px, 5px)')
  })

  it('ignores drags starting on title-bar buttons', () => {
    const onClose = vi.fn()
    render(<Panel title="BTN PANEL" style={ABS} onClose={onClose}>body</Panel>)

    fireEvent.pointerDown(screen.getByText('x'), { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 80, clientY: 80 })
    fireEvent.pointerUp(window)

    expect(useUIStore.getState().panelOffsets['BTN PANEL']).toBeUndefined()
  })

  it('clamps the offset on drag end so the title bar stays reachable', () => {
    const { container } = render(<Panel title="CLAMP" style={ABS}>body</Panel>)
    const el = container.firstChild as HTMLElement

    fireEvent.pointerDown(titleBar('CLAMP'), { clientX: 0, clientY: 0 })
    fireEvent.pointerMove(window, { clientX: 1100, clientY: 0 })
    // panel now hangs past the right viewport edge (jsdom viewport is 1024px wide)
    stubRect(el, { left: 1100, right: 1400 })
    fireEvent.pointerUp(window)

    expect(useUIStore.getState().panelOffsets['CLAMP']).toEqual({ dx: 1024 - 40, dy: 0 })
  })
})

describe('Panel z-order', () => {
  it('raises the clicked panel above siblings', () => {
    render(
      <>
        <Panel title="ALPHA" style={ABS}>alpha body</Panel>
        <Panel title="BRAVO" style={ABS}>bravo body</Panel>
      </>,
    )
    const z = (t: string) => Number(panelEl(t).style.zIndex)

    // last mounted starts on top
    expect(z('BRAVO')).toBeGreaterThan(z('ALPHA'))

    fireEvent.pointerDown(screen.getByText('alpha body'))
    expect(z('ALPHA')).toBeGreaterThan(z('BRAVO'))

    fireEvent.pointerDown(screen.getByText('bravo body'))
    expect(z('BRAVO')).toBeGreaterThan(z('ALPHA'))
  })
})

describe('Escape close ordering (closeTopPanel)', () => {
  it('closes only the topmost panel with an onClose', () => {
    const closeA = vi.fn()
    const closeB = vi.fn()
    render(
      <>
        <Panel title="ALPHA" style={ABS} onClose={closeA}>alpha body</Panel>
        <Panel title="BRAVO" style={ABS} onClose={closeB}>bravo body</Panel>
      </>,
    )
    fireEvent.pointerDown(screen.getByText('alpha body'))

    expect(useUIStore.getState().closeTopPanel()).toBe(true)
    expect(closeA).toHaveBeenCalledTimes(1)
    expect(closeB).not.toHaveBeenCalled()
  })

  it('skips panels without an onClose', () => {
    const closeB = vi.fn()
    render(
      <>
        <Panel title="PLAIN" style={ABS}>plain body</Panel>
        <Panel title="BRAVO" style={ABS} onClose={closeB}>bravo body</Panel>
      </>,
    )
    fireEvent.pointerDown(screen.getByText('plain body'))

    expect(useUIStore.getState().closeTopPanel()).toBe(true)
    expect(closeB).toHaveBeenCalledTimes(1)
  })

  it('returns false when no closable panel is registered', () => {
    render(<Panel title="PLAIN" style={ABS}>plain body</Panel>)
    expect(useUIStore.getState().closeTopPanel()).toBe(false)
  })

  it('unregisters on unmount so closed panels cannot be re-closed', () => {
    const closeA = vi.fn()
    const { unmount } = render(<Panel title="ALPHA" style={ABS} onClose={closeA}>alpha body</Panel>)
    unmount()

    expect(useUIStore.getState().closeTopPanel()).toBe(false)
    expect(closeA).not.toHaveBeenCalled()
  })
})
