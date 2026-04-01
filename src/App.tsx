import { useEffect } from 'react'
import GameMap from '@/components/map/GameMap'
import TimeControls from '@/components/hud/TimeControls'
import AlertFeed from '@/components/hud/AlertFeed'
import LaunchPanel from '@/components/panels/LaunchPanel'
import { initBridge } from '@/store/bridge'

export default function App() {
  useEffect(() => {
    initBridge()
  }, [])

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <GameMap />
      <TimeControls />
      <AlertFeed />
      <LaunchPanel />
    </div>
  )
}
