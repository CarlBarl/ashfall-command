interface StatBarProps {
  label: string
  value: number
  max: number
  color?: string
  showCount?: boolean
}

export default function StatBar({ label, value, max, color = 'var(--text-accent)', showCount = true }: StatBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>{label}</span>
        {showCount && (
          <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
            {value}/{max}
          </span>
        )}
      </div>
      <div style={{
        height: 4,
        background: 'var(--bg-hover)',
        borderRadius: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  )
}
