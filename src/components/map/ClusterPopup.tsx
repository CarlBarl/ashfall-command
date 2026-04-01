import type { UnitCluster } from './layers/cluster'
import { useUIStore } from '@/store/ui-store'

interface ClusterPopupProps {
  cluster: UnitCluster
  x: number
  y: number
  onClose: () => void
}

const STATUS_DOT: Record<string, string> = {
  ready: 'var(--status-ready)',
  engaged: 'var(--status-engaged)',
  damaged: 'var(--status-damaged)',
  moving: 'var(--status-moving)',
  reloading: 'var(--text-secondary)',
}

export default function ClusterPopup({ cluster, x, y, onClose }: ClusterPopupProps) {
  const selectUnit = useUIStore((s) => s.selectUnit)
  const targetingMode = useUIStore((s) => s.targetingMode)
  const setTarget = useUIStore((s) => s.setTarget)

  return (
    <div
      style={{
        position: 'fixed',
        left: Math.min(x, window.innerWidth - 260),
        top: Math.min(y, window.innerHeight - 300),
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: 8,
        zIndex: 50,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        minWidth: 220,
        maxHeight: 300,
        overflowY: 'auto',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      }}
      onMouseLeave={onClose}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
        paddingBottom: 4,
        borderBottom: '1px solid var(--border-default)',
      }}>
        <span style={{ color: 'var(--text-accent)', fontWeight: 600, textTransform: 'uppercase' }}>
          {cluster.count} units
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontFamily: 'var(--font-mono)',
          }}
        >x</button>
      </div>

      {cluster.units.map(u => {
        const totalWeapons = u.weapons.reduce((s, w) => s + w.count, 0)
        return (
          <div
            key={u.id}
            onClick={() => {
              if (targetingMode) {
                setTarget(u.id)
              } else {
                selectUnit(u.id)
              }
              onClose()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 6px',
              borderRadius: 3,
              cursor: 'pointer',
              marginBottom: 2,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {/* Status dot */}
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: STATUS_DOT[u.status] ?? 'var(--text-muted)',
            }} />

            {/* Name + category */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {u.name}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>
                {u.category.replace(/_/g, ' ')} / {u.health}%
                {totalWeapons > 0 && ` / ${totalWeapons} wpns`}
              </div>
            </div>

            {/* Targeting indicator */}
            {targetingMode && (
              <span style={{ color: 'var(--iran-primary)', fontSize: '0.6rem', fontWeight: 600 }}>
                TGT
              </span>
            )}
          </div>
        )
      })}

      {/* Target all button in targeting mode */}
      {targetingMode && cluster.units.length > 1 && (
        <button
          onClick={() => {
            // Target the primary — user can fire salvo which hits the group
            setTarget(cluster.primary.id)
            onClose()
          }}
          style={{
            width: '100%',
            marginTop: 4,
            padding: '5px 8px',
            background: 'var(--iran-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
          }}
        >
          TARGET GROUP ({cluster.count} units)
        </button>
      )}
    </div>
  )
}
