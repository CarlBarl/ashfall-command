import type { CSSProperties } from 'react'
import { lonLatToTile } from '@/data/feeds'

export const SCENARIO_START_UTC_MS = Date.UTC(2026, 5, 15, 6, 0, 0)

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** Military date-time group from a game tick (1 tick = 1 game second): DDHHMMZ MMM YY */
export function formatDtg(tick: number): string {
  const d = new Date(SCENARIO_START_UTC_MS + tick * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}Z ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`
}

/** Gulf local hour (UTC+3.5) for a UTC epoch ms — gates day/night imagery looks */
export function gulfLocalHour(utcMs: number): number {
  return (new Date(utcMs).getUTCHours() + new Date(utcMs).getUTCMinutes() / 60 + 3.5) % 24
}

export function isGulfDaylight(utcMs: number): boolean {
  const h = gulfLocalHour(utcMs)
  return h >= 6 && h < 17
}

/**
 * Tile rows/cols centered on a point. Even-sized axes pick the half of the
 * target tile the point falls in (via z+1) so it lands near the grid middle —
 * uses only lonLatToTile, no fractional math.
 */
export function tileGrid(lon: number, lat: number, z: number, cols: number, rows: number): { xs: number[]; ys: number[] } {
  const { x, y } = lonLatToTile(lon, lat, z)
  const half = lonLatToTile(lon, lat, z + 1)
  const start = (c: number, count: number, inFirstHalf: boolean) =>
    count % 2 === 0 ? (inFirstHalf ? c - count / 2 : c - count / 2 + 1) : c - Math.floor(count / 2)
  const xLeft = start(x, cols, half.x === 2 * x)
  const yTop = start(y, rows, half.y === 2 * y)
  return {
    xs: Array.from({ length: cols }, (_, i) => xLeft + i),
    ys: Array.from({ length: rows }, (_, i) => yTop + i),
  }
}

/** TV-static backdrop for failed feeds / missing tiles */
export const NOISE_BG: CSSProperties = {
  background:
    'repeating-linear-gradient(0deg, #0a0c10 0px, #161a20 1px, #0a0c10 2px, #1c2026 3px), ' +
    'repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0px, rgba(0,0,0,0.06) 2px)',
}

/** Film-grain/scanline overlay for imagery dressing — pointer-events none */
export const SCANLINE_OVERLAY: CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  background:
    'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, transparent 1px, transparent 3px), ' +
    'repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0px, transparent 2px, transparent 5px)',
  mixBlendMode: 'overlay',
}
