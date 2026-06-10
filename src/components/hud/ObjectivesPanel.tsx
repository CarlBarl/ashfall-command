import type { ObjectiveStatus } from '@/types/view'

const STATUS_COLORS: Record<ObjectiveStatus['status'], string> = {
  good: 'var(--status-ready)',
  contested: 'var(--status-engaged)',
  bad: 'var(--status-damaged)',
}

export default function ObjectivesPanel({ objectives }: { objectives: ObjectiveStatus[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {objectives.map((obj) => (
        <ObjectiveRow key={obj.id} objective={obj} />
      ))}
    </div>
  )
}

function ObjectiveRow({ objective }: { objective: ObjectiveStatus }) {
  const color = STATUS_COLORS[objective.status]
  const pct = Math.round(Math.max(0, Math.min(1, objective.progress)) * 100)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 3 }}>
        <span style={{
          color: 'var(--text-primary)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}>
          {objective.label}
        </span>
        <span style={{ color, fontSize: 'var(--font-size-xs)', fontWeight: 700 }}>{pct}%</span>
      </div>
      <div style={{ height: 4, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden', marginBottom: 3 }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
        {objective.detail}
      </div>
    </div>
  )
}
