import { TripsLayer } from '@deck.gl/geo-layers'
import { ScatterplotLayer } from '@deck.gl/layers'
import type { Missile, NationId } from '@/types/game'
import { weaponSpecs } from '@/data/weapons/missiles'

const NATION_TRAIL_COLORS: Record<string, [number, number, number]> = {
  usa: [80, 160, 255],
  iran: [255, 80, 80],
}

const NATION_HEAD_COLORS: Record<string, [number, number, number]> = {
  usa: [180, 220, 255],
  iran: [255, 180, 160],
}

const NATION_GLOW_COLORS: Record<string, [number, number, number, number]> = {
  usa: [80, 160, 255, 120],
  iran: [255, 80, 80, 120],
}

interface MissileHead {
  id: string
  position: [number, number]
  nation: NationId
  isBallistic: boolean
  altitude_km: number
  phase: string
}

/** Interpolate missile position along its path at the given game time */
function getMissilePosition(m: Missile, currentTime: number): [number, number] | null {
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

export function createMissileLayers(
  missiles: Missile[],
  currentTime: number,
  onHover?: (id: string | null, x?: number, y?: number) => void,
) {
  const inflight = missiles.filter(m => m.status === 'inflight')

  // Compute head positions
  const heads: MissileHead[] = []
  for (const m of inflight) {
    const pos = getMissilePosition(m, currentTime)
    if (!pos) continue
    const spec = weaponSpecs[m.weaponId]
    heads.push({
      id: m.id,
      position: pos,
      nation: m.nation,
      isBallistic: spec?.type === 'ballistic_missile',
      altitude_km: m.altitude_km,
      phase: m.phase,
    })
  }

  return [
    // Layer 1: Fading trail (CMANO-style thin line behind the missile)
    new TripsLayer<Missile>({
      id: 'missile-trail',
      data: inflight,
      getPath: (d) => d.path,
      getTimestamps: (d) => d.timestamps,
      getColor: (d) => NATION_TRAIL_COLORS[d.nation] ?? [200, 200, 200],
      currentTime,
      trailLength: 600_000, // 10 game minutes — long enough to see the full flight path
      fadeTrail: true,
      widthMinPixels: 1.5,
      widthMaxPixels: 3,
      jointRounded: true,
      capRounded: true,
      opacity: 0.7,
    }),

    // Layer 2: Brighter leading edge (thicker, shorter trail = bright head)
    new TripsLayer<Missile>({
      id: 'missile-head-trail',
      data: inflight,
      getPath: (d) => d.path,
      getTimestamps: (d) => d.timestamps,
      getColor: (d) => NATION_HEAD_COLORS[d.nation] ?? [255, 255, 255],
      currentTime,
      trailLength: 60_000, // 1 game minute — short bright head
      fadeTrail: true,
      widthMinPixels: 3,
      widthMaxPixels: 5,
      jointRounded: true,
      capRounded: true,
      opacity: 0.9,
    }),

    // Layer 3: Missile head dot (bright marker, pickable for tooltip)
    new ScatterplotLayer<MissileHead>({
      id: 'missile-head-dot',
      data: heads,
      pickable: true,
      getPosition: (d) => d.position,
      getRadius: (d) => d.isBallistic ? 8 : 5,
      getFillColor: (d) => NATION_HEAD_COLORS[d.nation] as [number, number, number] ?? [255, 255, 255],
      radiusUnits: 'pixels',
      filled: true,
      stroked: false,
      opacity: 1.0,
      onHover: (info) => {
        onHover?.(info.object?.id ?? null, info.x, info.y)
      },
    }),

    // Layer 4: Glow around the head (larger, semi-transparent)
    new ScatterplotLayer<MissileHead>({
      id: 'missile-head-glow',
      data: heads,
      getPosition: (d) => d.position,
      getRadius: (d) => d.isBallistic ? 14 : 10,
      getFillColor: (d) => NATION_GLOW_COLORS[d.nation] ?? [200, 200, 200, 100],
      radiusUnits: 'pixels',
      filled: true,
      stroked: false,
      opacity: 0.5,
    }),
  ]
}
