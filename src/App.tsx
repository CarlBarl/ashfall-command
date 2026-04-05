import { useCallback, useEffect, useState } from 'react'
import GameMap from '@/components/map/GameMap'
import TopBar from '@/components/hud/TopBar'
import AlertFeed from '@/components/hud/AlertFeed'
import StrikePanel from '@/components/panels/StrikePanel'
import UnitInfoPanel from '@/components/panels/UnitInfoPanel'
import EconomyPanel from '@/components/panels/EconomyPanel'
import OrbatPanel from '@/components/panels/OrbatPanel'
import StatsPanel from '@/components/panels/StatsPanel'
import IntelPanel from '@/components/panels/IntelPanel'
import StartScreen from '@/components/menu/StartScreen'
import ScenarioSelect from '@/components/menu/ScenarioSelect'
import FreeModeLobby from '@/components/menu/FreeModeLobby'
import DeploymentOverlay from '@/components/menu/DeploymentOverlay'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import { useMenuStore } from '@/store/menu-store'
import { useDeploymentStore } from '@/store/deployment-store'
import { useStrikeStore } from '@/store/strike-store'
import { useIsMobile } from '@/hooks/useIsMobile'
import { initBridge, initFromData, sendCommand } from '@/store/bridge'
import { getScenario } from '@/data/scenarios/index'

type MobilePanel = null | 'unit' | 'strike' | 'orbat' | 'stats' | 'econ' | 'events' | 'intel'

export default function App() {
  const isMobile = useIsMobile()
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null)
  const screen = useMenuStore(s => s.screen)

  useEffect(() => {
    initBridge()
  }, [])

  // When transitioning to 'playing', initialize the game engine
  useEffect(() => {
    if (screen !== 'playing') return
    const store = useMenuStore.getState()
    const mode = store.selectedMode ?? 'scenario'

    // Reuse scenario data for nations/economy in both modes
    const scenario = getScenario('persian-gulf-2026')!
    const data = scenario.getData()

    if (mode === 'scenario') {
      initFromData(store.selectedNation, data.nations, data.units, data.supplyLines, data.baseSupply, scenario.startDate)
    } else {
      // Free mode — use player-placed units + AI/manual enemy units
      const deployStore = useDeploymentStore.getState()
      const allUnits = deployStore.confirmDeployment()
      initFromData(store.selectedNation, data.nations, allUnits, [], {}, scenario.startDate)
    }
  }, [screen])

  const units = useGameStore((s) => s.viewState.units)
  const selectedUnitId = useUIStore((s) => s.selectedUnitId)
  const showOrbat = useUIStore((s) => s.showOrbat)
  const showStats = useUIStore((s) => s.showStats)
  const showEconomy = useUIStore((s) => s.showEconomy)
  const showIntel = useUIStore((s) => s.showIntel)
  // StrikePanel manages its own visibility via useStrikeStore

  useEffect(() => {
    if (isMobile && selectedUnitId) {
      setMobilePanel('unit')
    }
  }, [isMobile, selectedUnitId])

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Skip when typing in inputs
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return

    switch (e.key) {
      // Time: 1-5 = speed presets, Space = pause/resume
      case ' ':
        e.preventDefault()
        sendCommand({ type: 'SET_SPEED', speed: useGameStore.getState().viewState.time.speed === 0 ? 1 : 0 })
        break
      case '1': sendCommand({ type: 'SET_SPEED', speed: 0.1 }); break   // 1s/s
      case '2': sendCommand({ type: 'SET_SPEED', speed: 6 }); break     // 1m/s
      case '3': sendCommand({ type: 'SET_SPEED', speed: 60 }); break    // 10m/s
      case '4': sendCommand({ type: 'SET_SPEED', speed: 600 }); break   // 1h/s
      case '5': sendCommand({ type: 'SET_SPEED', speed: 3600 }); break  // 10h/s

      // Panels
      case 'o': useUIStore.getState().toggleLeftPanel('orbat'); break
      case 'e': useUIStore.getState().toggleLeftPanel('economy'); break
      case 'i': useUIStore.getState().toggleIntel(); break

      // Map overlays
      case 'r': useUIStore.setState((s) => ({ rngFilter: s.rngFilter === 'off' ? 'both' : 'off' })); break
      case 'l': useUIStore.setState((s) => ({ losFilter: s.losFilter === 'off' ? 'both' : 'off' })); break
      case 'v': useUIStore.getState().toggleElevation(); break
      case 'm': useUIStore.getState().cycleMapMode(); break

      // Selection
      case 'Escape':
        useUIStore.getState().clearSelection()
        break
    }
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Menu screens — shown before game starts
  if (screen === 'start') return <StartScreen />
  if (screen === 'scenario-select') return <ScenarioSelect />
  if (screen === 'free-lobby') return <FreeModeLobby />
  if (screen === 'deployment') return <DeploymentOverlay />

  if (isMobile) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <GameMap />
        <TopBar />
        {mobilePanel === 'unit' && <UnitInfoPanel units={units} />}
        {mobilePanel === 'strike' && <StrikePanel />}
        {mobilePanel === 'orbat' && <OrbatPanel />}
        {mobilePanel === 'stats' && <StatsPanel />}
        {mobilePanel === 'econ' && <EconomyPanel />}
        {mobilePanel === 'events' && <AlertFeed />}
        {mobilePanel === 'intel' && <IntelPanel />}
        <MobileNav active={mobilePanel} onSelect={setMobilePanel} hasSelection={!!selectedUnitId} />
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <GameMap />
      <TopBar />
      <AlertFeed />
      <UnitInfoPanel units={units} />
      <StrikePanel />
      {showOrbat && <OrbatPanel />}
      {showStats && <StatsPanel />}
      {showEconomy && <EconomyPanel />}
      {showIntel && <IntelPanel />}
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
  const openStrike = useStrikeStore((s) => s.openStrike)
  const closeStrike = useStrikeStore((s) => s.closeStrike)

  const tabs: { key: MobilePanel; label: string; show?: boolean; accent?: string }[] = [
    { key: 'orbat', label: 'OOB' },
    { key: 'unit', label: 'UNIT', show: hasSelection },
    { key: 'strike', label: 'FIRE', accent: 'var(--iran-primary)' },
    { key: 'stats', label: 'SIT' },
    { key: 'econ', label: 'ECON' },
    { key: 'intel', label: 'INTEL' },
    { key: 'events', label: 'LOG' },
  ]

  const visible = tabs.filter(t => t.show !== false)

  const handleSelect = (key: MobilePanel) => {
    if (active === key) {
      // Closing the active panel
      if (key === 'strike') closeStrike()
      onSelect(null)
    } else {
      // Opening a panel
      if (key === 'strike') openStrike('plan')
      if (active === 'strike') closeStrike()
      onSelect(key)
    }
  }

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
      padding: '0',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      {visible.map(t => {
        const isActive = active === t.key
        const accentColor = t.accent && isActive ? t.accent : 'var(--border-accent)'
        return (
          <button
            key={t.key}
            onClick={() => handleSelect(t.key)}
            style={{
              flex: 1,
              padding: '8px 0 6px',
              background: isActive ? 'var(--bg-hover)' : 'transparent',
              border: 'none',
              borderTop: isActive ? `2px solid ${accentColor}` : '2px solid transparent',
              color: isActive ? (t.accent ?? 'var(--text-accent)') : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.55rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
