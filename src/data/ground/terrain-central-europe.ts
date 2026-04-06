import type { ControlGrid, ControlCell, TerrainType } from '@/types/ground'

/**
 * Creates the control grid for the Poland 1939 theater.
 *
 * 60 rows x 70 cols, ~10km per cell = 600km N-S x 700km E-W
 * Origin: ~49.0N, 14.0E (southern Bohemia)
 * North edge: ~54.4N (Baltic coast)
 * East edge: ~23.5E (eastern Poland)
 *
 * Control is determined by point-in-polygon against the 1939
 * Poland border (extracted from europe_1939.geojson), with a
 * special carve-out for the East Prussia German exclave.
 *
 * Terrain is generated deterministically from row/col patterns
 * with real geographic features placed at approximate positions:
 *   - Vistula river running roughly N-S through cols 30-35
 *   - Carpathian foothills in southern rows (0-8), eastern cols
 *   - Warsaw urban area at ~row 30, col 35
 *   - Krakow urban area at ~row 10, col 30
 *   - Lodz urban area at ~row 22, col 28
 *   - Danzig (Gdansk) urban area at ~row 55, col 30
 *   - Poznan urban area at ~row 35, col 18
 *   - Forests concentrated in central-northern Poland
 */

// ── 1939 Poland border polygon [lng, lat] ──────────────────────
// Extracted from public/geo/europe_1939.geojson (iso_a3: "POL")
const POLAND_1939: [number, number][] = [
  [22.6, 49.1], [23.5, 49.1], [24, 49], [24.7, 49], [25.5, 49.4],
  [26.5, 49.8], [27, 50.5], [27.5, 51], [27.8, 51.5], [27.5, 52],
  [27, 52.3], [26, 52.5], [25, 52], [24.5, 52.2], [24, 52.3],
  [23.5, 52], [23.5, 52.5], [24, 53], [24, 53.5], [25.5, 54.2],
  [26, 54.3], [26.5, 55.2], [25.8, 55.3], [21.3, 55.3], [21, 55.3],
  [20, 54.9], [19.8, 54.4], [19.4, 54.2], [18.7, 54.4], [18.3, 54.8],
  [17, 54.8], [16.2, 54.4], [14.2, 53.9], [14.2, 53.3], [14.5, 52.6],
  [15, 52], [14.8, 51.7], [15, 51.1], [16, 51], [17, 51],
  [18.2, 50.6], [18.6, 50.5], [19, 50.4], [19.8, 50.3], [20.8, 50.2],
  [22.1, 50], [22.6, 49.6], [22.6, 49.1],
]

const KM_PER_DEG = 111.0
const DEG_TO_RAD = Math.PI / 180

/** Ray-casting point-in-polygon test */
function pointInPoland(lng: number, lat: number): boolean {
  let inside = false
  const poly = POLAND_1939
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1]
    const xj = poly[j][0], yj = poly[j][1]
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Deterministic terrain assignment based on grid position */
function getTerrain(row: number, col: number): TerrainType {
  // ── Urban centers (real city positions) ──
  // Warsaw
  if (row >= 29 && row <= 31 && col >= 34 && col <= 36) return 'urban'
  // Krakow
  if (row >= 9 && row <= 11 && col >= 29 && col <= 31) return 'urban'
  // Lodz
  if (row >= 21 && row <= 23 && col >= 27 && col <= 29) return 'urban'
  // Poznan
  if (row >= 34 && row <= 36 && col >= 17 && col <= 19) return 'urban'
  // Danzig
  if (row >= 54 && row <= 56 && col >= 29 && col <= 31) return 'urban'
  // Breslau (German side)
  if (row >= 3 && row <= 4 && col >= 20 && col <= 22) return 'urban'
  // Konigsberg (East Prussia)
  if (row >= 55 && row <= 57 && col >= 48 && col <= 50) return 'urban'

  // ── Vistula river corridor (runs roughly N-S) ──
  // The Vistula meanders: col shifts with row
  const vistulaCol = Math.floor(33 + 2 * Math.sin(row * 0.15))
  if (col >= vistulaCol - 1 && col <= vistulaCol + 1 && row >= 5 && row <= 55) {
    // River crossings near cities are not river
    if (row >= 29 && row <= 31) return 'plains' // Warsaw bridge
    return 'river'
  }

  // ── Bug river (eastern border) ──
  if (col >= 55 && col <= 57 && row >= 15 && row <= 45) return 'river'

  // ── Carpathian foothills (southern rows, eastern columns) ──
  if (row <= 6 && col >= 35) return 'hills'
  if (row <= 3 && col >= 40) return 'hills'

  // ── Forests ──
  // Bialowieza / eastern forest belt
  if (col >= 50 && col <= 60 && row >= 25 && row <= 40) return 'forest'
  // Tuchola forest (north-central)
  if (col >= 22 && col <= 28 && row >= 42 && row <= 50) return 'forest'
  // Kampinos forest (near Warsaw)
  if (row >= 31 && row <= 34 && col >= 32 && col <= 36) return 'forest'

  // ── Deterministic scatter using hash ──
  // Creates a pseudo-random but reproducible terrain pattern
  const hash = ((row * 7919 + col * 104729) >>> 0) % 100
  if (hash < 60) return 'plains'
  if (hash < 80) return 'forest'
  if (hash < 90) return 'hills'
  if (hash < 95) return 'marsh'
  return 'plains' // remaining 5% still plains (river/urban placed above)
}

/** Determine initial controller based on the 1939 border polygon */
function getController(row: number, col: number): string | null {
  // East Prussia exclave: German territory in the northeast
  if (row >= 50 && col >= 40) return 'germany'

  // Convert grid cell to lat/lng (same math as cellToLatLng in frontline.ts)
  const lat = 49.0 + row * (10 / KM_PER_DEG)
  const cosLat = Math.cos(lat * DEG_TO_RAD)
  const lng = 14.0 + col * (10 / (KM_PER_DEG * cosLat))

  // Points inside the 1939 Poland polygon are Polish; everything else is German
  // (Germany surrounded Poland on three sides: west, south, and the East Prussian exclave)
  return pointInPoland(lng, lat) ? 'poland' : 'germany'
}

export function createCentralEuropeGrid(): ControlGrid {
  const rows = 60
  const cols = 70
  const cells: ControlCell[] = new Array(rows * cols)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c
      const controller = getController(r, c)
      cells[idx] = {
        controller: controller as string | null,
        pressure: controller === 'germany' ? 20 : controller === 'poland' ? -20 : 0,
        terrain: getTerrain(r, c),
        fortification: controller === 'poland' && r >= 5 && r <= 7 ? 25 : 0,
        supplyConnected: true,
      }
    }
  }

  return {
    rows,
    cols,
    originLat: 49.0,
    originLng: 14.0,
    cellSizeKm: 10,
    cells,
  }
}
