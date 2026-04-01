import { TripsLayer } from '@deck.gl/geo-layers'
import type { Missile } from '@/types/game'

const NATION_COLORS: Record<string, [number, number, number]> = {
  usa: [100, 180, 255],
  iran: [255, 100, 100],
}

export function createMissileLayer(missiles: Missile[], currentTime: number) {
  return new TripsLayer<Missile>({
    id: 'missile-layer',
    data: missiles.filter(m => m.status === 'inflight'),
    getPath: (d) => d.path,
    getTimestamps: (d) => d.timestamps,
    getColor: (d) => NATION_COLORS[d.nation] ?? [200, 200, 200],
    currentTime,
    trailLength: 120_000, // 2 game minutes of trail
    fadeTrail: true,
    widthMinPixels: 2,
    widthMaxPixels: 4,
    jointRounded: true,
    capRounded: true,
  })
}
