import type { CSSProperties, ReactNode } from 'react'

interface PanelProps {
  title: string
  children: ReactNode
  style?: CSSProperties
  onClose?: () => void
}

export default function Panel({ title, children, style, onClose }: PanelProps) {
  return (
    <div style={{
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--panel-radius)',
      padding: 'var(--panel-padding)',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-sm)',
      color: 'var(--text-primary)',
      minWidth: 260,
      maxHeight: '80vh',
      overflowY: 'auto',
      ...style,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
        paddingBottom: 6,
        borderBottom: '1px solid var(--border-default)',
      }}>
        <span style={{
          fontSize: 'var(--font-size-base)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: 'var(--text-accent)',
        }}>
          {title}
        </span>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'var(--font-size-lg)',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            x
          </button>
        )}
      </div>
      {children}
    </div>
  )
}
