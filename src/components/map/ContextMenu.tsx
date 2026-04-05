import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import { bearing } from '@/engine/utils/geo'
import { getMainThreadGrid } from './layers/LOSLayer'
import { destination } from '@turf/destination'

const FIXED_CATEGORIES = new Set(['airbase', 'naval_base'])
const OPTIMIZE_RADIUS_KM = 30
const OPTIMIZE_SAMPLES = 36 // sample every 10 degrees at 3 radii

/** Score a position by how much radar coverage it has (simplified LOS check) */
function scoreLOS(lat: number, lng: number, antennaHeightM: number, rangeKm: number): number {
  const grid = getMainThreadGrid()
  if (!grid) return 0

  if (grid.isWater(lat, lng)) return -Infinity // never place on water
  const groundElev = grid.getElevation(lat, lng)
  const radarAlt = groundElev + antennaHeightM

  // Elevation bonus — higher ground gives inherently better radar coverage
  let score = groundElev * 0.5
  const numRays = 36
  const steps = 10

  for (let ray = 0; ray < numRays; ray++) {
    const azimuth = (ray * 360) / numRays
    let maxObstacleAngle = -Infinity

    for (let step = 1; step <= steps; step++) {
      const dist = (step / steps) * rangeKm
      const pt = destination([lng, lat], dist, azimuth, { units: 'kilometers' })
      const coords = pt.geometry.coordinates
      const terrainElev = grid.getElevation(coords[1], coords[0])
      const angle = Math.atan2(terrainElev - radarAlt, dist * 1000)

      if (angle > maxObstacleAngle) {
        maxObstacleAngle = angle
        score += dist // more visible distance = higher score
      } else if (terrainElev - radarAlt > 0) {
        break
      }
    }
  }
  return score
}

interface ContextMenuProps {
  x: number
  y: number
  lngLat: { lng: number; lat: number }
  shiftKey: boolean
  onClose: () => void
}

export default function ContextMenu({ x, y, lngLat, shiftKey, onClose }: ContextMenuProps) {
  const selectedId = useUIStore((s) => s.selectedUnitId)
  const units = useGameStore((s) => s.viewState.units)
  const unit = units.find((u) => u.id === selectedId)

  if (!unit) return null

  const canMove = !FIXED_CATEGORIES.has(unit.category)
  const hasRadar = unit.sensors?.some(s => s.type === 'radar')
  const hasSectorRadar = unit.sensors?.some(
    (s) => s.type === 'radar' && s.sector_deg != null && s.sector_deg < 360,
  )

  const handleOptimize = () => {
    const radar = unit.sensors?.find(s => s.type === 'radar')
    if (!radar) return

    const antennaH = radar.antenna_height_m ?? 15
    const rangeKm = radar.range_km

    let bestScore = scoreLOS(unit.position.lat, unit.position.lng, antennaH, rangeKm)
    let bestPos = unit.position

    // Sample positions at 3 radii around current position
    const radii = [OPTIMIZE_RADIUS_KM * 0.3, OPTIMIZE_RADIUS_KM * 0.6, OPTIMIZE_RADIUS_KM]
    for (const radius of radii) {
      for (let i = 0; i < OPTIMIZE_SAMPLES; i++) {
        const azimuth = (i * 360) / OPTIMIZE_SAMPLES
        const pt = destination(
          [unit.position.lng, unit.position.lat],
          radius,
          azimuth,
          { units: 'kilometers' },
        )
        const coords = pt.geometry.coordinates
        const s = scoreLOS(coords[1], coords[0], antennaH, rangeKm)
        if (s > bestScore) {
          bestScore = s
          bestPos = { lat: coords[1], lng: coords[0] }
        }
      }
    }

    if (bestPos !== unit.position) {
      sendCommand({
        type: 'MOVE_UNIT',
        unitId: unit.id,
        waypoints: [bestPos],
      })
    }

    // Auto-orient radar toward nearest enemy unit
    const enemies = units.filter(u => u.nation !== unit.nation && u.status !== 'destroyed')
    if (enemies.length > 0 && hasSectorRadar) {
      let nearestEnemy = enemies[0]
      let nearestDist = Infinity
      const pos = bestPos !== unit.position ? bestPos : unit.position
      for (const e of enemies) {
        const dLat = e.position.lat - pos.lat
        const dLng = e.position.lng - pos.lng
        const d = dLat * dLat + dLng * dLng
        if (d < nearestDist) { nearestDist = d; nearestEnemy = e }
      }
      const hdg = bearing(pos, nearestEnemy.position)
      sendCommand({ type: 'SET_HEADING', unitId: unit.id, heading: hdg })
    }

    onClose()
  }

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: 4,
        zIndex: 100,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-sm)',
        minWidth: 160,
      }}
      onMouseLeave={onClose}
    >
      {canMove && (
        <MenuItem
          label={shiftKey ? `Queue waypoint` : `Move ${unit.name.split(' ')[0]}`}
          onClick={() => {
            const newWaypoint = { lat: lngLat.lat, lng: lngLat.lng }
            if (shiftKey && unit.waypoints && unit.waypoints.length > 0) {
              sendCommand({
                type: 'MOVE_UNIT',
                unitId: unit.id,
                waypoints: [...unit.waypoints, newWaypoint],
              })
            } else {
              sendCommand({
                type: 'MOVE_UNIT',
                unitId: unit.id,
                waypoints: [newWaypoint],
              })
            }
            onClose()
          }}
        />
      )}
      {canMove && hasRadar && (
        <MenuItem
          label="Optimize position (30km)"
          onClick={handleOptimize}
        />
      )}
      {hasSectorRadar && (
        <MenuItem
          label="Orient radar here"
          onClick={() => {
            const hdg = bearing(unit.position, { lat: lngLat.lat, lng: lngLat.lng })
            sendCommand({ type: 'SET_HEADING', unitId: unit.id, heading: hdg })
            onClose()
          }}
        />
      )}
      <MenuItem
        label="Cancel"
        onClick={onClose}
        muted
      />
    </div>
  )
}

function MenuItem({ label, onClick, muted }: { label: string; onClick: () => void; muted?: boolean }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '4px 8px',
        cursor: 'pointer',
        color: muted ? 'var(--text-muted)' : 'var(--text-primary)',
        borderRadius: 3,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {label}
    </div>
  )
}
