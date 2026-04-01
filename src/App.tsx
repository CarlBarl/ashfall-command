import { useEffect, useState } from 'react'
import GameMap from '@/components/map/GameMap'
import TimeControls from '@/components/hud/TimeControls'
import TopBar from '@/components/hud/TopBar'
import AlertFeed from '@/components/hud/AlertFeed'
import LaunchPanel from '@/components/panels/LaunchPanel'
import UnitInfoPanel from '@/components/panels/UnitInfoPanel'
import EconomyPanel from '@/components/panels/EconomyPanel'
import OrbatPanel from '@/components/panels/OrbatPanel'
import StatsPanel from '@/components/panels/StatsPanel'
import CommandPanel from '@/components/panels/CommandPanel'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import { useIsMobile } from '@/hooks/useIsMobile'
import { initBridge } from '@/store/bridge'

type MobilePanel = null | 'unit' | 'launch' | 'orbat' | 'stats' | 'econ' | 'cmd' | 'events'

export default function App() {
  const isMobile = useIsMobile()
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)

  useEffect(() => {
    initBridge()
  }, [])

  const units = useGameStore((s) => s.viewState.units)
  const selectedUnitId = useUIStore((s) => s.selectedUnitId)
  const showOrbat = useUIStore((s) => s.showOrbat)
  const showStats = useUIStore((s) => s.showStats)
  const showEconomy = useUIStore((s) => s.showEconomy)
  const showCommand = useUIStore((s) => s.showCommand)

  // On mobile, auto-show unit panel when a unit is selected
  useEffect(() => {
    if (isMobile && selectedUnitId) {
      setMobilePanel('unit')
    }
  }, [isMobile, selectedUnitId])

  if (isMobile) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <GameMap />

        {/* Compact top HUD */}
        <TimeControls />

        {/* Mobile bottom sheet — only one at a time */}
        {mobilePanel === 'unit' && <UnitInfoPanel units={units} />}
        {mobilePanel === 'launch' && <LaunchPanel />}
        {mobilePanel === 'orbat' && <OrbatPanel />}
        {mobilePanel === 'stats' && <StatsPanel />}
        {mobilePanel === 'econ' && <EconomyPanel />}
        {mobilePanel === 'cmd' && <CommandPanel />}
        {mobilePanel === 'events' && <AlertFeed />}

        {/* Mobile bottom nav */}
        <MobileNav active={mobilePanel} onSelect={setMobilePanel} hasSelection={!!selectedUnitId} />
      </div>
    )
  }

  // Desktop layout (unchanged)
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <GameMap />
      <TimeControls />
      <TopBar />
      <AlertFeed />
      <UnitInfoPanel units={units} />
      <LaunchPanel />
      {showOrbat && <OrbatPanel />}
      {showStats && <StatsPanel />}
      {showEconomy && <EconomyPanel />}
      {showCommand && <CommandPanel />}
    </div>
  )
}

function MobileNav({
  active,
  onSelect,
  hasSelection,
}: {
  active: MobilePanel
  onSelect: (p: MobilePanel) => void
  hasSelection: boolean
}) {
  const tabs: { key: MobilePanel; label: string; show?: boolean }[] = [
    { key: 'orbat', label: 'OOB' },
    { key: 'unit', label: 'UNIT', show: hasSelection },
    { key: 'launch', label: 'FIRE', show: hasSelection },
    { key: 'cmd', label: 'CMD' },
    { key: 'econ', label: 'ECON' },
    { key: 'events', label: 'LOG' },
  ]

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      display: 'flex',
      background: 'var(--bg-panel)',
      borderTop: '1px solid var(--border-default)',
      zIndex: 40,
      padding: '0 2px',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {tabs.filter(t => t.show !== false).map(t => (
        <button
          key={t.key}
          onClick={() => onSelect(active === t.key ? null : t.key)}
          style={{
            flex: 1,
            padding: '10px 0 8px',
            background: active === t.key ? 'var(--bg-hover)' : 'transparent',
            border: 'none',
            borderTop: active === t.key ? '2px solid var(--border-accent)' : '2px solid transparent',
            color: active === t.key ? 'var(--text-accent)' : 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            cursor: 'pointer',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
