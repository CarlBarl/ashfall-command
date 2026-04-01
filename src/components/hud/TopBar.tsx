import { useUIStore } from '@/store/ui-store'

export default function TopBar() {
  const showRangeRings = useUIStore((s) => s.showRangeRings)
  const toggleRangeRings = useUIStore((s) => s.toggleRangeRings)

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: 12,
      zIndex: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--panel-radius)',
      padding: '4px 8px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-xs)',
      color: 'var(--text-primary)',
    }}>
      <button
        onClick={toggleRangeRings}
        style={{
          background: showRangeRings ? 'var(--bg-hover)' : 'none',
          border: `1px solid ${showRangeRings ? 'var(--border-accent)' : 'var(--border-default)'}`,
          borderRadius: 4,
          color: showRangeRings ? 'var(--text-accent)' : 'var(--text-secondary)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
          padding: '2px 8px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        RANGE RINGS
      </button>
    </div>
  )
}
