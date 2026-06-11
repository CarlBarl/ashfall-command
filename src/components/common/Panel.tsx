import { useRef, useState, useEffect, useCallback, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useUIStore } from '@/store/ui-store'

const Z_BASE = 20
/** Min px of the title bar that must remain inside the viewport after a drag */
const EDGE_MARGIN = 40

interface PanelProps {
  title: string
  children: ReactNode
  style?: CSSProperties
  onClose?: () => void
  defaultMinimized?: boolean
}

/** Strip all positioning props from style on mobile */
function stripPosition(s: CSSProperties | undefined): CSSProperties {
  if (!s) return {}
  const { position, top, right, bottom, left, width, minWidth, maxWidth, transform, ...rest } = s
  return rest
}

export default function Panel({ title, children, style, onClose, defaultMinimized = false }: PanelProps) {
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLDivElement>(null)
  const [minimized, setMinimized] = useState(defaultMinimized)
  const [dragging, setDragging] = useState(false)

  const offset = useUIStore((s) => s.panelOffsets[title])
  const focusPanel = useUIStore((s) => s.focusPanel)
  const zIndex = useUIStore((s) => {
    const reg = s.panelRegistry[title]
    if (!reg) return Z_BASE
    let below = 0
    for (const other of Object.values(s.panelRegistry)) {
      if (other.lastFocus < reg.lastFocus) below++
    }
    return Z_BASE + below
  })

  // Live ref so consumer re-renders can swap onClose without re-registering (which would reset focus order)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    useUIStore.getState().registerPanel(title, onCloseRef)
    return () => useUIStore.getState().unregisterPanel(title)
  }, [title])

  // Detach window drag listeners if unmounted mid-drag
  const dragCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => dragCleanupRef.current?.(), [])

  const onTitlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (isMobile || e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, a')) return
    const panel = panelRef.current
    if (!panel) return
    e.preventDefault()

    const start = useUIStore.getState().panelOffsets[title] ?? { dx: 0, dy: 0 }
    const startX = e.clientX
    const startY = e.clientY
    setDragging(true)

    const onMove = (ev: PointerEvent) => {
      useUIStore.getState().setPanelOffset(title, {
        dx: start.dx + ev.clientX - startX,
        dy: start.dy + ev.clientY - startY,
      })
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragCleanupRef.current = null
      setDragging(false)
    }
    const onUp = () => {
      cleanup()
      const rect = panel.getBoundingClientRect()
      const cur = useUIStore.getState().panelOffsets[title] ?? { dx: 0, dy: 0 }
      let { dx, dy } = cur
      if (rect.left > window.innerWidth - EDGE_MARGIN) dx -= rect.left - (window.innerWidth - EDGE_MARGIN)
      if (rect.right < EDGE_MARGIN) dx += EDGE_MARGIN - rect.right
      if (rect.top < 0) dy -= rect.top
      if (rect.top > window.innerHeight - EDGE_MARGIN) dy -= rect.top - (window.innerHeight - EDGE_MARGIN)
      if (dx !== cur.dx || dy !== cur.dy) useUIStore.getState().setPanelOffset(title, { dx, dy })
    }
    dragCleanupRef.current = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [isMobile, title])

  const dx = offset?.dx ?? 0
  const dy = offset?.dy ?? 0
  // Drag offset rides on top of the consumer's own transform (e.g. translateX(-50%) centering)
  const dragStyle: CSSProperties = (!isMobile && (dx !== 0 || dy !== 0))
    ? { transform: `${typeof style?.transform === 'string' ? `${style.transform} ` : ''}translate(${dx}px, ${dy}px)` }
    : {}

  const mobileStyle: CSSProperties = isMobile ? {
    position: 'fixed',
    bottom: 44, // above the nav bar
    left: 0,
    right: 0,
    top: 'auto',
    width: '100%',
    maxHeight: '50vh',
    minWidth: 'unset',
    borderRadius: '12px 12px 0 0',
    zIndex: 30,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  } : {}

  return (
    <div
      ref={panelRef}
      onPointerDownCapture={() => focusPanel(title)}
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: minimized ? '4px 8px' : 'var(--panel-padding)',
        fontFamily: 'var(--font-mono)',
        fontSize: isMobile ? 'var(--font-size-xs)' : 'var(--font-size-sm)',
        color: 'var(--text-primary)',
        minWidth: minimized ? 120 : 260,
        maxHeight: minimized ? 'auto' : '80vh',
        overflowY: minimized ? 'hidden' : 'auto',
        zIndex,
        ...(isMobile ? stripPosition(style) : style),
        ...(isMobile ? mobileStyle : dragStyle),
      }}
    >
      <div
        onPointerDown={onTitlePointerDown}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: minimized ? 0 : 8,
          paddingBottom: minimized ? 0 : 6,
          borderBottom: minimized ? 'none' : '1px solid var(--border-default)',
          cursor: isMobile ? 'default' : dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          gap: 8,
        }}
      >
        <span style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-accent)',
          whiteSpace: 'nowrap',
        }}>
          {title}
        </span>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {!isMobile && <TitleButton label={minimized ? '+' : '-'} onClick={() => setMinimized(!minimized)} />}
          {onClose && <TitleButton label="x" onClick={onClose} />}
        </div>
      </div>
      {!minimized && children}
    </div>
  )
}

function TitleButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: 'var(--font-size-sm)',
        padding: '0 3px',
        lineHeight: 1,
        fontFamily: 'var(--font-mono)',
      }}
    >
      {label}
    </button>
  )
}
