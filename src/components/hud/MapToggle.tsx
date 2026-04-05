import { useState } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { CSSProperties } from 'react'

const container: CSSProperties = {
  position: 'fixed',
  bottom: 80,
  left: 16,
  display: 'flex',
  gap: 0,
  zIndex: 10,
}

const mobileContainer: CSSProperties = {
  position: 'fixed',
  bottom: 44,
  right: 8,
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

type OpenSub = null | 'rng' | 'los' | 'int'

export default function MapToggle() {
  const isMobile = useIsMobile()
  const mapMode = useUIStore(s => s.mapMode)
  const showElevation = useUIStore(s => s.showElevation)
  const rngFilter = useUIStore(s => s.rngFilter)
  const losFilter = useUIStore(s => s.losFilter)
  const showIntelCoverage = useUIStore(s => s.showIntelCoverage)
  const cycleMapMode = useUIStore(s => s.cycleMapMode)
  const toggleElevation = useUIStore(s => s.toggleElevation)
  const toggleIntelCoverage = useUIStore(s => s.toggleIntelCoverage)

  const [openSub, setOpenSub] = useState<OpenSub>(null)

  const isSat = mapMode === 'satellite'
  const rngOn = rngFilter !== 'off'
  const losOn = losFilter !== 'off'

  const toggleSub = (sub: OpenSub) => setOpenSub(prev => prev === sub ? null : sub)

  const setRNG = (filter: 'off' | 'friendly' | 'enemy' | 'both') => {
    useUIStore.setState({ rngFilter: filter })
  }

  const setLOS = (filter: typeof losFilter) => {
    useUIStore.setState({ losFilter: filter })
  }

  return (
    <div style={isMobile ? mobileContainer : container}>
      {/* Main button column */}
      <div style={mainCol}>
        <button onClick={cycleMapMode} style={{ ...btnFirst, ...(isSat ? active : {}) }} title="Toggle map style">
          {isSat ? 'SAT' : 'MAP'}
        </button>
        <button onClick={toggleElevation} style={{ ...btn, ...(showElevation ? active : {}) }} title="Elevation overlay">
          ELV
        </button>
        <button onClick={() => toggleSub('rng')} style={{ ...btn, ...(rngOn ? active : {}), ...(openSub === 'rng' ? { background: 'var(--bg-hover)' } : {}) }} title="Range circles">
          RNG
        </button>
        <button onClick={() => toggleSub('los')} style={{ ...btn, ...(losOn ? active : {}), ...(openSub === 'los' ? { background: 'var(--bg-hover)' } : {}) }} title="Line of sight">
          LOS
        </button>
        <button onClick={() => toggleSub('int')} style={{ ...btn, ...(showIntelCoverage ? { ...active, color: '#ffaa33' } : {}), ...(openSub === 'int' ? { background: 'var(--bg-hover)' } : {}) }} title="Intel coverage">
          INT
        </button>
      </div>

      {/* Sub-menu panels */}
      {openSub === 'rng' && (
        <div style={subMenu}>
          <button onClick={() => setRNG('both')} style={{ ...btnFirst, ...(rngFilter === 'both' ? active : {}), minWidth: 64 }}>
            ALL
          </button>
          <button onClick={() => setRNG('friendly')} style={{ ...btn, ...(rngFilter === 'friendly' ? active : {}), color: rngFilter === 'friendly' ? '#4488cc' : undefined }}>
            FRD
          </button>
          <button onClick={() => setRNG('enemy')} style={{ ...btn, ...(rngFilter === 'enemy' ? active : {}), color: rngFilter === 'enemy' ? '#cc4444' : undefined }}>
            ENM
          </button>
          <button onClick={() => setRNG('off')} style={{ ...btn, color: 'var(--text-muted)' }}>
            OFF
          </button>
        </div>
      )}

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
          <button onClick={() => setLOS('off')} style={{ ...btn, color: 'var(--text-muted)' }}>
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
