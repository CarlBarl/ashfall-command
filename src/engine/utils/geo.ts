import type { Position } from '@/types/game'

const R = 6371 // Earth radius in km
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

/** Haversine distance between two positions in km */
export function haversine(a: Position, b: Position): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Initial bearing from a to b in degrees (0-360) */
export function bearing(a: Position, b: Position): number {
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat))
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Destination point given start, bearing (deg), and distance (km) */
export function destination(start: Position, bearingDeg: number, distKm: number): Position {
  const d = distKm / R
  const brng = toRad(bearingDeg)
  const lat1 = toRad(start.lat)
  const lng1 = toRad(start.lng)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    )

  return { lat: toDeg(lat2), lng: toDeg(lng2) }
}

/** Generate N points along a great circle from a to b */
export function greatCirclePath(a: Position, b: Position, numPoints: number): [number, number][] {
  const points: [number, number][] = []
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints
    const d = haversine(a, b) / R
    const sinD = Math.sin(d)
    const lat1 = toRad(a.lat)
    const lng1 = toRad(a.lng)
    const lat2 = toRad(b.lat)
    const lng2 = toRad(b.lng)

    const A = Math.sin((1 - f) * d) / sinD
    const B = Math.sin(f * d) / sinD

    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2)
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2)
    const z = A * Math.sin(lat1) + B * Math.sin(lat2)

    points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))])
  }
  return points
}

/** Convert knots to km/h */
export function ktsToKmh(kts: number): number {
  return kts * 1.852
}

/** Convert Mach to km/h (at sea level) */
export function machToKmh(mach: number): number {
  return mach * 1235
}
