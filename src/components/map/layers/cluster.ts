import type { ViewUnit } from '@/types/view'

const CLUSTER_RADIUS_KM = 30

export interface UnitCluster {
  id: string
  units: ViewUnit[]
  /** The "primary" unit — highest priority category */
  primary: ViewUnit
  position: { lng: number; lat: number }
  nation: string
  count: number
}

const CATEGORY_PRIORITY: Record<string, number> = {
  carrier_group: 10,
  airbase: 9,
  naval_base: 8,
  sam_site: 7,
  missile_battery: 6,
  ship: 5,
  submarine: 4,
  aircraft: 3,
}

/** Cluster nearby friendly units into groups */
export function clusterUnits(units: ViewUnit[]): (ViewUnit | UnitCluster)[] {
  const alive = units.filter(u => u.status !== 'destroyed')
  const used = new Set<string>()
  const results: (ViewUnit | UnitCluster)[] = []

  // Sort by priority so we anchor clusters on the most important unit
  const sorted = [...alive].sort((a, b) =>
    (CATEGORY_PRIORITY[b.category] ?? 0) - (CATEGORY_PRIORITY[a.category] ?? 0)
  )

  for (const unit of sorted) {
    if (used.has(unit.id)) continue
    used.add(unit.id)

    // Find nearby same-nation units not yet clustered
    const nearby: ViewUnit[] = [unit]
    for (const other of sorted) {
      if (used.has(other.id)) continue
      if (other.nation !== unit.nation) continue
      if (fastDistKm(unit.position, other.position) <= CLUSTER_RADIUS_KM) {
        nearby.push(other)
        used.add(other.id)
      }
    }

    if (nearby.length === 1) {
      results.push(unit)
    } else {
      // Average position, weighted toward primary
      const primary = nearby[0] // already sorted by priority
      const avgLng = nearby.reduce((s, u) => s + u.position.lng, 0) / nearby.length
      const avgLat = nearby.reduce((s, u) => s + u.position.lat, 0) / nearby.length

      results.push({
        id: `cluster_${primary.id}`,
        units: nearby,
        primary,
        position: { lng: avgLng, lat: avgLat },
        nation: unit.nation,
        count: nearby.length,
      })
    }
  }

  return results
}

export function isCluster(item: ViewUnit | UnitCluster): item is UnitCluster {
  return 'units' in item && 'count' in item
}

/** Fast approximate distance in km (equirectangular) */
function fastDistKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const dLat = (b.lat - a.lat) * 111.32
  const dLng = (b.lng - a.lng) * 111.32 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}
