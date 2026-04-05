import { useUIStore } from '@/store/ui-store'
import type { CSSProperties } from 'react'

const container: CSSProperties = {
  position: 'fixed',
  bottom: 80,
  left: 16,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--panel-radius)',
  overflow: 'hidden',
  zIndex: 10,
}

const btn: CSSProperties = {
  width: 48,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  borderTop: '1px solid var(--border-default)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 600,
  letterSpacing: '0.1em',
  color: 'var(--text-secondary)',
  padding: 0,
}

const btnFirst: CSSProperties = {
  ...btn,
  borderTop: 'none',
}

const btnActive: CSSProperties = {
  borderColor: 'var(--border-accent)',
  color: 'var(--text-accent)',
  boxShadow: 'inset 0 0 0 1px var(--border-accent)',
}

export default function MapToggle() {
  const mapMode = useUIStore((s) => s.mapMode)
  const showElevation = useUIStore((s) => s.showElevation)
  const showRangeRings = useUIStore((s) => s.showRangeRings)
  const showRadarLOS = useUIStore((s) => s.showRadarLOS)
  const showIntelCoverage = useUIStore((s) => s.showIntelCoverage)
  const cycleMapMode = useUIStore((s) => s.cycleMapMode)
  const toggleElevation = useUIStore((s) => s.toggleElevation)
  const toggleRangeRings = useUIStore((s) => s.toggleRangeRings)
  const toggleRadarLOS = useUIStore((s) => s.toggleRadarLOS)
  const toggleIntelCoverage = useUIStore((s) => s.toggleIntelCoverage)

  const isSat = mapMode === 'satellite'

  return (
    <div style={container}>
      <button
        onClick={cycleMapMode}
        style={{
          ...btnFirst,
          ...(isSat ? btnActive : {}),
        }}
        title={isSat ? 'Switch to dark map' : 'Switch to satellite'}
      >
        {isSat ? 'SAT' : 'MAP'}
      </button>
      <button
        onClick={toggleElevation}
        style={{
          ...btn,
          ...(showElevation ? btnActive : {}),
        }}
        title="Toggle elevation overlay"
      >
        ELV
      </button>
      <button
        onClick={toggleRangeRings}
        style={{
          ...btn,
          ...(showRangeRings ? btnActive : {}),
        }}
        title="Toggle radar range circles (friendly blue, enemy red)"
      >
        RNG
      </button>
      <button
        onClick={toggleRadarLOS}
        style={{
          ...btn,
          ...(showRadarLOS ? btnActive : {}),
        }}
        title="Toggle terrain-masked LOS on hover/select"
      >
        LOS
      </button>
      <button
        onClick={toggleIntelCoverage}
        style={{
          ...btn,
          ...(showIntelCoverage ? { ...btnActive, color: '#ffaa33' } : {}),
        }}
        title="Toggle estimated intel coverage (amber)"
      >
        INT
      </button>
    </div>
  )
}
