import type { ControlGrid, ControlCell, TerrainType } from '@/types/ground'

/**
 * Creates the control grid for the Poland 1939 theater.
 *
 * 60 rows x 70 cols, ~10km per cell = 600km N-S x 700km E-W
 * Origin: ~49.0N, 14.0E (southern Bohemia)
 * North edge: ~54.4N (Baltic coast)
 * East edge: ~23.5E (eastern Poland)
 *
 * Germany controls rows 0-4 (the border zone).
 * Poland controls rows 5+ (interior Poland).
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

/** Determine initial controller based on the 1939 border */
function getController(row: number, col: number): string | null {
  // Germany controls rows 0-4 (southern border zone / Silesia / Pomerania)
  // Also East Prussia in the northeast corner
  if (row <= 4) return 'germany'
  if (row >= 50 && col >= 40) return 'germany' // East Prussia pocket

  // Poland controls the rest
  if (row >= 5) return 'poland'

  return null
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
