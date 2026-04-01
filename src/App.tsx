import { useEffect } from 'react'
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
import { initBridge } from '@/store/bridge'

export default function App() {
  useEffect(() => {
    initBridge()
  }, [])

  const units = useGameStore((s) => s.viewState.units)
  const showOrbat = useUIStore((s) => s.showOrbat)
  const showStats = useUIStore((s) => s.showStats)
  const showEconomy = useUIStore((s) => s.showEconomy)
  const showCommand = useUIStore((s) => s.showCommand)

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
