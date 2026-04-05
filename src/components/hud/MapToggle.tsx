import { useState } from 'react'
import { useUIStore } from '@/store/ui-store'
import type { CSSProperties } from 'react'

const container: CSSProperties = {
  position: 'fixed',
  bottom: 80,
  left: 16,
  display: 'flex',
  gap: 0,
  zIndex: 10,
}

const mainCol: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--panel-radius)',
  overflow: 'hidden',
}

const subMenu: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--panel-radius)',
  marginLeft: 4,
  overflow: 'hidden',
}

const btn: CSSProperties = {
  height: 28,
  minWidth: 48,
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
  padding: '0 6px',
  whiteSpace: 'nowrap',
}

const btnFirst: CSSProperties = { ...btn, borderTop: 'none' }
const active: CSSProperties = { borderColor: 'var(--border-accent)', color: 'var(--text-accent)', boxShadow: 'inset 0 0 0 1px var(--border-accent)' }

type OpenSub = null | 'los' | 'int'

export default function MapToggle() {
  const mapMode = useUIStore(s => s.mapMode)
  const showElevation = useUIStore(s => s.showElevation)
  const showRangeRings = useUIStore(s => s.showRangeRings)
  const losFilter = useUIStore(s => s.losFilter)
  const showIntelCoverage = useUIStore(s => s.showIntelCoverage)
  const cycleMapMode = useUIStore(s => s.cycleMapMode)
  const toggleElevation = useUIStore(s => s.toggleElevation)
  const toggleRangeRings = useUIStore(s => s.toggleRangeRings)
  const toggleIntelCoverage = useUIStore(s => s.toggleIntelCoverage)

  const [openSub, setOpenSub] = useState<OpenSub>(null)

  const isSat = mapMode === 'satellite'
  const losOn = losFilter !== 'off'

  const toggleSub = (sub: OpenSub) => setOpenSub(prev => prev === sub ? null : sub)

  const setLOS = (filter: typeof losFilter) => {
    useUIStore.setState({ losFilter: filter })
  }

  return (
    <div style={container}>
      {/* Main button column */}
      <div style={mainCol}>
        <button onClick={cycleMapMode} style={{ ...btnFirst, ...(isSat ? active : {}) }} title="Toggle map style">
          {isSat ? 'SAT' : 'MAP'}
        </button>
        <button onClick={toggleElevation} style={{ ...btn, ...(showElevation ? active : {}) }} title="Elevation overlay">
          ELV
        </button>
        <button onClick={toggleRangeRings} style={{ ...btn, ...(showRangeRings ? active : {}) }} title="Range circles">
          RNG
        </button>
        <button onClick={() => toggleSub('los')} style={{ ...btn, ...(losOn ? active : {}), ...(openSub === 'los' ? { background: 'var(--bg-hover)' } : {}) }} title="Line of sight">
          LOS
        </button>
        <button onClick={() => toggleSub('int')} style={{ ...btn, ...(showIntelCoverage ? { ...active, color: '#ffaa33' } : {}), ...(openSub === 'int' ? { background: 'var(--bg-hover)' } : {}) }} title="Intel coverage">
          INT
        </button>
      </div>

      {/* Sub-menu panel */}
      {openSub === 'los' && (
        <div style={subMenu}>
          <button onClick={() => setLOS('both')} style={{ ...btnFirst, ...(losFilter === 'both' ? active : {}), minWidth: 64 }}>
            ALL
          </button>
          <button onClick={() => setLOS('friendly')} style={{ ...btn, ...(losFilter === 'friendly' ? active : {}), color: losFilter === 'friendly' ? '#4488cc' : undefined }}>
            FRD
          </button>
          <button onClick={() => setLOS('enemy')} style={{ ...btn, ...(losFilter === 'enemy' ? active : {}), color: losFilter === 'enemy' ? '#cc4444' : undefined }}>
            ENM
          </button>
          <button onClick={() => setLOS('off')} style={{ ...btn, ...(losFilter === 'off' ? {} : {}), color: 'var(--text-muted)' }}>
            OFF
          </button>
        </div>
      )}

      {openSub === 'int' && (
        <div style={subMenu}>
          <button onClick={toggleIntelCoverage} style={{ ...btnFirst, ...(showIntelCoverage ? { ...active, color: '#ffaa33' } : {}), minWidth: 64 }}>
            {showIntelCoverage ? 'ON' : 'OFF'}
          </button>
        </div>
      )}
    </div>
  )
}
