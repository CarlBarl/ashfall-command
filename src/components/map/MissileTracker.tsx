import { useEffect, useRef, useState } from 'react'
import type { MapRef } from 'react-map-gl/maplibre'
import type { Missile } from '@/types/game'
import type { ViewUnit } from '@/types/view'
import { weaponSpecs } from '@/data/weapons/missiles'

interface MissileTrackerProps {
  missile: Missile
  mapRef: React.RefObject<MapRef | null>
  units: ViewUnit[]
  currentTime: number
  onClose: () => void
}

export default function MissileTracker({ missile, mapRef, units, currentTime, onClose }: MissileTrackerProps) {
  const [screenPos, setScreenPos] = useState<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number>(0)

  // Project missile position to screen coordinates, updating each frame
  useEffect(() => {
    function updatePosition() {
      const map = mapRef.current?.getMap()
      if (map) {
        // Interpolate missile lng/lat from its path+timestamps
        const pos = interpolatePosition(missile, currentTime)
        if (pos) {
          const point = map.project(pos)
          setScreenPos({ x: point.x, y: point.y })
        }
      }
      rafRef.current = requestAnimationFrame(updatePosition)
    }
    rafRef.current = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(rafRef.current)
  }, [mapRef, missile, currentTime])

  if (!screenPos) return null

  const spec = weaponSpecs[missile.weaponId]
  const weaponName = spec?.name ?? missile.weaponId
  const target = units.find(u => u.id === missile.targetId)
  const targetName = target?.name ?? missile.targetId

  const remainingMs = missile.eta - currentTime
  const remainingSec = Math.max(0, Math.round(remainingMs / 1000))
  const etaStr = remainingSec > 60
    ? `${Math.floor(remainingSec / 60)}m ${remainingSec % 60}s`
    : `${remainingSec}s`

  // Position panel offset from the missile icon
  const panelX = screenPos.x + 20
  const panelY = screenPos.y - 20

  return (
    <div style={{
      position: 'fixed',
      left: panelX,
      top: panelY,
      background: 'rgba(13, 17, 23, 0.92)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--panel-radius)',
      padding: '6px 10px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-xs)',
      color: 'var(--text-primary)',
      zIndex: 60,
      pointerEvents: 'auto',
      minWidth: 160,
      maxWidth: 220,
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      transform: 'translateY(-50%)',
    }}>
      {/* Header with close button */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
        paddingBottom: 3,
        borderBottom: '1px solid var(--border-default)',
      }}>
        <span style={{
          fontWeight: 600,
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-accent)',
        }}>
          {weaponName}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
            padding: '0 0 0 6px',
            lineHeight: 1,
          }}
        >
          x
        </button>
      </div>

      {/* Stats rows */}
      <TrackerRow label="Speed" value={`${missile.speed_current_mach.toFixed(1)} Mach`} />
      <TrackerRow label="Alt" value={`${(missile.altitude_km * 1000).toFixed(0)}m`} />
      <TrackerRow label="Phase" value={missile.phase.toUpperCase()} highlight />
      <TrackerRow label="Target" value={targetName} />
      <TrackerRow label="ETA" value={remainingSec > 0 ? etaStr : 'IMPACT'} highlight />
    </div>
  )
}

function TrackerRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '1px 0' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: highlight ? 'var(--text-accent)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

/** Interpolate missile position from its path + timestamps */
function interpolatePosition(m: Missile, currentTime: number): [number, number] | null {
  const { timestamps, path } = m
  if (timestamps.length < 2) return null

  if (currentTime <= timestamps[0]) return path[0]
  if (currentTime >= timestamps[timestamps.length - 1]) return path[path.length - 1]

  for (let i = 0; i < timestamps.length - 1; i++) {
    if (currentTime >= timestamps[i] && currentTime < timestamps[i + 1]) {
      const t = (currentTime - timestamps[i]) / (timestamps[i + 1] - timestamps[i])
      return [
        path[i][0] + (path[i + 1][0] - path[i][0]) * t,
        path[i][1] + (path[i + 1][1] - path[i][1]) * t,
      ]
    }
  }
  return null
}
