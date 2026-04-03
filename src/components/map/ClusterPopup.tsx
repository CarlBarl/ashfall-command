import type { UnitCluster } from './layers/cluster'
import { useUIStore } from '@/store/ui-store'
import { useStrikeStore } from '@/store/strike-store'
import type { MouseEvent } from 'react'

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
  const toggleUnitSelection = useUIStore((s) => s.toggleUnitSelection)
  const selectMultipleUnits = useUIStore((s) => s.selectMultipleUnits)
  const selectedUnitIds = useUIStore((s) => s.selectedUnitIds)
  const targetingMode = useStrikeStore((s) => s.targetingMode)
  const setTargetUnitId = useStrikeStore((s) => s.setTargetUnitId)

  const friendlyUnits = cluster.units.filter(u => u.nation === 'usa')

  const handleUnitClick = (unitId: string, e: MouseEvent) => {
    const clickedUnit = cluster.units.find(u => u.id === unitId)
    const isEnemy = clickedUnit && clickedUnit.nation !== 'usa'

    if (targetingMode || isEnemy) {
      // Clicking any enemy unit sets it as target and opens strike panel
      setTargetUnitId(unitId)
      onClose()
      return
    }

    if (e.metaKey || e.ctrlKey) {
      toggleUnitSelection(unitId)
    } else {
      selectUnit(unitId)
      onClose()
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: Math.min(x, window.innerWidth - 280),
        top: Math.min(y, window.innerHeight - 350),
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: 8,
        zIndex: 50,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        minWidth: 240,
        maxHeight: 350,
        overflowY: 'auto',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      }}
      onMouseLeave={onClose}
    >
      {/* Header */}
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

      {/* Hint */}
      <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', marginBottom: 4, fontStyle: 'italic' }}>
        {targetingMode ? 'Click to target' : 'Click to select / Cmd+click for multi-select'}
      </div>

      {/* Unit list */}
      {cluster.units.map(u => {
        const totalWeapons = u.weapons.reduce((s, w) => s + w.count, 0)
        const isSelected = selectedUnitIds.has(u.id)
        return (
          <div
            key={u.id}
            onClick={(e) => handleUnitClick(u.id, e)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 6px',
              borderRadius: 3,
              cursor: 'pointer',
              marginBottom: 2,
              borderLeft: isSelected ? '3px solid var(--border-accent)' : '3px solid transparent',
              background: isSelected ? 'var(--bg-hover)' : 'transparent',
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
          >
            <div style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: STATUS_DOT[u.status] ?? 'var(--text-muted)',
            }} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {u.name}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>
                {u.category.replace(/_/g, ' ')} / {u.health}%
                {totalWeapons > 0 && ` / ${totalWeapons} wpns`}
              </div>
            </div>

            {targetingMode && (
              <span style={{ color: 'var(--iran-primary)', fontSize: '0.6rem', fontWeight: 600 }}>TGT</span>
            )}
            {isSelected && !targetingMode && (
              <span style={{ color: 'var(--text-accent)', fontSize: '0.6rem', fontWeight: 600 }}>SEL</span>
            )}
          </div>
        )
      })}

      {/* Action buttons — always visible */}
      <div style={{ marginTop: 6, display: 'flex', gap: 4, flexDirection: 'column' }}>
        {/* SELECT ALL — for friendly clusters */}
        {friendlyUnits.length > 1 && (
          <button
            onClick={() => {
              selectMultipleUnits(friendlyUnits.map(u => u.id))
              onClose()
            }}
            style={{
              ...actionBtnStyle,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-accent)',
              color: 'var(--text-accent)',
            }}
          >
            SELECT ALL FRIENDLY ({friendlyUnits.length})
          </button>
        )}

        {/* SELECT ALL in cluster (any nation — for inspection) */}
        {cluster.units.length > 1 && friendlyUnits.length === 0 && (
          <button
            onClick={() => {
              // Select first enemy to show its info
              selectUnit(cluster.units[0].id)
              onClose()
            }}
            style={{
              ...actionBtnStyle,
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            INSPECT ({cluster.count} units)
          </button>
        )}

        {/* TARGET GROUP — opens StrikePanel in DIRECT FIRE mode with cluster primary */}
        {cluster.units.length > 0 && cluster.units[0].nation !== 'usa' && (
          <button
            onClick={() => {
              setTargetUnitId(cluster.primary.id)
              onClose()
            }}
            style={{
              ...actionBtnStyle,
              background: 'var(--iran-secondary)',
              border: '1px solid var(--iran-primary)',
              color: '#fff',
            }}
          >
            TARGET {cluster.count > 1 ? `GROUP (${cluster.count})` : cluster.primary.name}
          </button>
        )}
      </div>
    </div>
  )
}

const actionBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  borderRadius: 4,
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 600,
  textAlign: 'center',
}
