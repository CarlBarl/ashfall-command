import { useRef, useState, useCallback, type CSSProperties, type ReactNode, type PointerEvent } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'

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
  const { position, top, right, bottom, left, width, minWidth, maxWidth, ...rest } = s
  return rest
}

export default function Panel({ title, children, style, onClose, defaultMinimized = false }: PanelProps) {
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null)
  const [minimized, setMinimized] = useState(defaultMinimized)
  const dragState = useRef<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null)

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (isMobile) return // no drag on mobile
    const panel = panelRef.current
    if (!panel) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)

    const rect = panel.getBoundingClientRect()
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origLeft: rect.left,
      origTop: rect.top,
    }
  }, [isMobile])

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    setOffset({
      x: dragState.current.origLeft + dx,
      y: dragState.current.origTop + dy,
    })
  }, [])

  const onPointerUp = useCallback(() => {
    dragState.current = null
  }, [])

  const positionStyle: CSSProperties = (!isMobile && offset)
    ? { position: 'fixed', left: offset.x, top: offset.y, right: 'auto', bottom: 'auto' }
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
        zIndex: 10,
        ...(isMobile ? stripPosition(style) : style),
        ...(isMobile ? mobileStyle : positionStyle),
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: minimized ? 0 : 8,
          paddingBottom: minimized ? 0 : 6,
          borderBottom: minimized ? 'none' : '1px solid var(--border-default)',
          cursor: isMobile ? 'default' : 'grab',
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
        {!isMobile && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <TitleButton label={minimized ? '+' : '-'} onClick={() => setMinimized(!minimized)} />
            {onClose && <TitleButton label="x" onClick={onClose} />}
          </div>
        )}
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
