import type { ShippingLane } from '@/types/game'

/**
 * Global shipping lanes for the Persian Gulf theater.
 * Throughput figures based on real-world 2026 pre-war data:
 * - Strait of Hormuz: ~17M barrels/day (25% of global seaborne oil)
 * - Bab el-Mandeb: ~4M barrels/day (Red Sea → Gulf of Aden)
 */

export const shippingLanes: ShippingLane[] = [
  {
    id: 'hormuz',
    name: 'Strait of Hormuz',
    path: [
      [54.0, 26.8],   // Persian Gulf (Kuwait/Saudi coast)
      [54.5, 26.3],   // Central Gulf
      [55.5, 26.2],   // Approaching strait
      [56.3, 26.5],   // Strait narrows
      [56.8, 26.2],   // Strait exit
      [58.0, 24.5],   // Gulf of Oman
      [60.0, 23.0],   // Arabian Sea
    ],
    baseThroughput_mbd: 17.0,
    currentThroughput_mbd: 17.0,
    suppressionFactor: 0,
    status: 'open',
  },
  {
    id: 'bab_el_mandeb',
    name: 'Bab el-Mandeb',
    path: [
      [40.0, 15.0],   // Southern Red Sea
      [42.5, 13.5],   // Approaching strait
      [43.3, 12.6],   // Bab el-Mandeb narrows
      [45.0, 12.0],   // Gulf of Aden
      [48.0, 11.5],   // Eastern Gulf of Aden
    ],
    baseThroughput_mbd: 4.0,
    currentThroughput_mbd: 4.0,
    suppressionFactor: 0,
    status: 'open',
  },
]
