import { ElevationGrid } from '@/engine/systems/elevation'

/**
 * ElevationOverlay — generates a semi-transparent canvas image from the
 * elevation grid, suitable for use as a MapLibre raster image source.
 *
 * The canvas paints each grid cell as a single pixel, colored by elevation:
 *   - Sea/water (<=0): transparent
 *   - Low (0-500m): dark green → yellow-green
 *   - Medium (500-1500m): yellow → orange
 *   - High (1500-3000m): orange → red-brown
 *   - Very high (3000m+): red-brown → white
 *
 * Returns a data URL and the geographic bounds for the raster source.
 */

interface ElevationOverlayResult {
  dataUrl: string
  bounds: [number, number, number, number] // [west, south, east, north]
}

/** Map an elevation value (meters) to an RGBA color. */
function elevationToColor(elev: number): [number, number, number, number] {
  if (elev <= 0) return [0, 0, 0, 0] // transparent for water/sea

  // Normalize to color bands
  if (elev <= 200) {
    // Low terrain: dark olive-green
    const t = elev / 200
    return [
      Math.round(20 + t * 40),  // 20→60
      Math.round(40 + t * 50),  // 40→90
      Math.round(15 + t * 15),  // 15→30
      140,
    ]
  }
  if (elev <= 600) {
    // Low-medium: olive → tan
    const t = (elev - 200) / 400
    return [
      Math.round(60 + t * 80),   // 60→140
      Math.round(90 + t * 30),   // 90→120
      Math.round(30 + t * 30),   // 30→60
      150,
    ]
  }
  if (elev <= 1500) {
    // Medium: tan → brown
    const t = (elev - 600) / 900
    return [
      Math.round(140 + t * 20),  // 140→160
      Math.round(120 - t * 40),  // 120→80
      Math.round(60 - t * 20),   // 60→40
      160,
    ]
  }
  if (elev <= 3000) {
    // High: brown → reddish-brown
    const t = (elev - 1500) / 1500
    return [
      Math.round(160 + t * 40),  // 160→200
      Math.round(80 - t * 30),   // 80→50
      Math.round(40 + t * 20),   // 40→60
      170,
    ]
  }
  // Very high (>3000m): reddish → light gray/white peaks
  const t = Math.min(1, (elev - 3000) / 2500)
  return [
    Math.round(200 + t * 55),  // 200→255
    Math.round(50 + t * 180),  // 50→230
    Math.round(60 + t * 170),  // 60→230
    180,
  ]
}

let cachedResult: ElevationOverlayResult | null = null

/**
 * Generate the elevation overlay canvas image.
 * Caches the result since the grid is static.
 */
export function generateElevationOverlay(grid: ElevationGrid): ElevationOverlayResult {
  if (cachedResult) return cachedResult

  const rows = grid.numRows
  const cols = grid.numCols
  const data = grid.data
  const bounds = grid.bounds

  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows

  const ctx = canvas.getContext('2d')!
  const imageData = ctx.createImageData(cols, rows)
  const pixels = imageData.data

  // The grid is stored south-to-north (row 0 = southernmost),
  // but canvas Y=0 is the top. So we flip vertically.
  for (let row = 0; row < rows; row++) {
    const canvasY = rows - 1 - row // flip: grid row 0 (south) → canvas bottom
    for (let col = 0; col < cols; col++) {
      const elev = data[row * cols + col]
      const [r, g, b, a] = elevationToColor(elev)
      const idx = (canvasY * cols + col) * 4
      pixels[idx] = r
      pixels[idx + 1] = g
      pixels[idx + 2] = b
      pixels[idx + 3] = a
    }
  }

  ctx.putImageData(imageData, 0, 0)

  cachedResult = {
    dataUrl: canvas.toDataURL(),
    bounds: [bounds.lngMin, bounds.latMin, bounds.lngMax, bounds.latMax],
  }

  return cachedResult
}
