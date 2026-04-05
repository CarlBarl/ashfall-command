import { useEffect, useCallback, useMemo, useRef, useState, type CSSProperties } from 'react'
import MapGL from 'react-map-gl/maplibre'
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre'
import DeckOverlay from '@/components/map/DeckOverlay'
import MapToggle from '@/components/hud/MapToggle'
import { IconLayer, TextLayer } from '@deck.gl/layers'
import { useMenuStore } from '@/store/menu-store'
import { useDeploymentStore } from '@/store/deployment-store'
import { useUIStore } from '@/store/ui-store'
import { isValidPlacement } from '@/data/theater-water'
import { getMapStyle } from '@/styles/map-providers'

const INITIAL_VIEW = {
  longitude: 51.4,
  latitude: 27.5,
  zoom: 4.5,
  pitch: 0,
  bearing: 0,
}

const ICON_MAPPING: Record<string, { x: number; y: number; width: number; height: number; mask: boolean }> = {
  airbase:         { x: 0,   y: 0,   width: 64, height: 64, mask: true },
  naval_base:      { x: 64,  y: 0,   width: 64, height: 64, mask: true },
  sam_site:        { x: 128, y: 0,   width: 64, height: 64, mask: true },
  missile_battery: { x: 192, y: 0,   width: 64, height: 64, mask: true },
  aircraft:        { x: 0,   y: 64,  width: 64, height: 64, mask: true },
  ship:            { x: 64,  y: 64,  width: 64, height: 64, mask: true },
  submarine:       { x: 128, y: 64,  width: 64, height: 64, mask: true },
  carrier_group:   { x: 192, y: 64,  width: 64, height: 64, mask: true },
}

const NATION_COLORS: Record<string, [number, number, number]> = {
  usa: [68, 136, 204],
  iran: [204, 68, 68],
}

const CATEGORY_LABELS: Record<string, string> = {
  airbase: 'Airbase',
  naval_base: 'Naval Base',
  sam_site: 'Air Defense',
  missile_battery: 'Missiles',
  aircraft: 'Aircraft',
  ship: 'Naval',
  submarine: 'Submarine',
  carrier_group: 'Carrier Group',
}

// ── Styles ──────────────────────────────────────────────────────────

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'flex',
}

const mapContainer: CSSProperties = {
  flex: 1,
  position: 'relative',
  cursor: 'crosshair',
}

const sidebar: CSSProperties = {
  width: 320,
  background: 'var(--bg-primary)',
  borderLeft: '1px solid var(--border-default)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'var(--font-mono)',
  overflowY: 'auto',
}

const sidebarHeader: CSSProperties = {
  padding: '16px 16px 12px',
  borderBottom: '1px solid var(--border-default)',
}

const activeUnitBox: CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--border-default)',
  background: 'var(--bg-hover)',
}

const unitListContainer: CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '8px 0',
}

const buttonBar: CSSProperties = {
  padding: '12px 16px',
  borderTop: '1px solid var(--border-default)',
  display: 'flex',
  gap: 8,
}

// ── Component ───────────────────────────────────────────────────────

export default function DeploymentOverlay() {
  const screen = useMenuStore(s => s.screen)
  const selectedNation = useMenuStore(s => s.selectedNation)
  const setScreen = useMenuStore(s => s.setScreen)

  const unplacedUnits = useDeploymentStore(s => s.unplacedUnits)
  const placedUnits = useDeploymentStore(s => s.placedUnits)
  const activeIndex = useDeploymentStore(s => s.activeIndex)
  const enemyUnits = useDeploymentStore(s => s.enemyUnits)
  const selectedPlacedIndex = useDeploymentStore(s => s.selectedPlacedIndex)
  const init = useDeploymentStore(s => s.init)
  const placeUnit = useDeploymentStore(s => s.placeUnit)
  const moveUnit = useDeploymentStore(s => s.moveUnit)
  const selectPlaced = useDeploymentStore(s => s.selectPlaced)
  const undoLast = useDeploymentStore(s => s.undoLast)

  const mapMode = useUIStore((s) => s.mapMode)
  const mapStyle = useMemo(() => getMapStyle(mapMode), [mapMode])

  const [placementError, setPlacementError] = useState<string | null>(null)
  const errorTimeout = useRef<ReturnType<typeof setTimeout>>(null)

  const enemyNation = selectedNation === 'usa' ? 'iran' : 'usa'

  // Initialize deployment store on mount
  useEffect(() => {
    if (screen === 'deployment') {
      init(selectedNation, enemyNation)
    }
  }, [screen, selectedNation, enemyNation, init])

  const showError = useCallback((msg: string) => {
    setPlacementError(msg)
    if (errorTimeout.current) clearTimeout(errorTimeout.current)
    errorTimeout.current = setTimeout(() => setPlacementError(null), 2000)
  }, [])

  const handleMapClick = useCallback((e: MapLayerMouseEvent) => {
    const lat = e.lngLat.lat
    const lng = e.lngLat.lng

    // If a placed unit is selected for repositioning, move it
    if (selectedPlacedIndex != null) {
      const entry = placedUnits[selectedPlacedIndex]?.entry
      if (entry && !isValidPlacement(entry.category, lat, lng)) {
        const terrain = ['ship', 'submarine', 'carrier_group'].includes(entry.category) ? 'WATER' : 'LAND'
        showError(`${entry.name.toUpperCase()} MUST BE PLACED ON ${terrain}`)
        return
      }
      moveUnit(selectedPlacedIndex, { lat, lng })
      selectPlaced(null)
      return
    }

    // Still placing units
    if (activeIndex >= unplacedUnits.length) return

    const unit = unplacedUnits[activeIndex]
    if (!isValidPlacement(unit.category, lat, lng)) {
      const terrain = ['ship', 'submarine', 'carrier_group'].includes(unit.category) ? 'WATER' : 'LAND'
      showError(`${unit.name.toUpperCase()} MUST BE PLACED ON ${terrain}`)
      return
    }

    placeUnit({ lat, lng })
  }, [activeIndex, unplacedUnits, placedUnits, selectedPlacedIndex, placeUnit, moveUnit, selectPlaced, showError])

  const handleLaunch = useCallback(() => {
    setScreen('playing')
  }, [setScreen])

  const handleBack = useCallback(() => {
    setScreen('free-lobby')
  }, [setScreen])

  if (screen !== 'deployment') return null

  const allPlaced = activeIndex >= unplacedUnits.length
  const activeUnit = allPlaced ? null : unplacedUnits[activeIndex]

  // Build deck.gl layers
  interface MarkerData {
    id: string
    index: number  // index into placedUnits (-1 for enemy)
    position: { lng: number; lat: number }
    category: string
    name: string
    nation: string
  }

  const placedData: MarkerData[] = placedUnits.map((pu, i) => ({
    id: `placed_${i}`,
    index: i,
    position: pu.position,
    category: pu.entry.category,
    name: pu.entry.name,
    nation: pu.entry.nation,
  }))

  const enemyData: MarkerData[] = enemyUnits.map((u) => ({
    id: u.id,
    index: -1,
    position: u.position,
    category: u.category,
    name: u.name,
    nation: u.nation,
  }))

  // Player placed units — pickable, click to select for repositioning
  const playerIconLayer = new IconLayer<MarkerData>({
    id: 'deployment-player-icons',
    data: placedData,
    pickable: true,
    iconAtlas: '/sprites/unit-atlas.svg',
    iconMapping: ICON_MAPPING,
    getIcon: (d) => d.category,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getSize: (d) => d.index === selectedPlacedIndex ? 48 : 36,
    getColor: (d) => {
      const c = NATION_COLORS[d.nation] ?? [200, 200, 200]
      if (d.index === selectedPlacedIndex) return [255, 255, 100, 255] as [number, number, number, number]
      return [...c, 255] as [number, number, number, number]
    },
    sizeUnits: 'pixels' as const,
    sizeMinPixels: 22,
    sizeMaxPixels: 56,
    onClick: (info) => {
      const d = info.object
      if (d && d.index >= 0 && allPlaced) {
        // Toggle selection: click same unit to deselect, different to select
        selectPlaced(selectedPlacedIndex === d.index ? null : d.index)
        return true
      }
      return false
    },
  })

  // Enemy units — non-pickable
  const enemyIconLayer = new IconLayer<MarkerData>({
    id: 'deployment-enemy-icons',
    data: enemyData,
    pickable: false,
    iconAtlas: '/sprites/unit-atlas.svg',
    iconMapping: ICON_MAPPING,
    getIcon: (d) => d.category,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getSize: 30,
    getColor: (d) => {
      const c = NATION_COLORS[d.nation] ?? [200, 200, 200]
      return [...c, 180] as [number, number, number, number]
    },
    sizeUnits: 'pixels' as const,
    sizeMinPixels: 18,
    sizeMaxPixels: 40,
  })

  const labelLayer = new TextLayer<MarkerData>({
    id: 'deployment-labels',
    data: placedData, // only label player units to reduce clutter
    getText: (d) => d.name.length > 20 ? d.name.slice(0, 18) + '...' : d.name,
    getPosition: (d) => [d.position.lng, d.position.lat],
    getColor: [220, 220, 220, 220],
    getSize: 11,
    getTextAnchor: 'middle' as const,
    getAlignmentBaseline: 'top' as const,
    getPixelOffset: [0, 22],
    fontFamily: 'monospace',
    fontWeight: 600,
  })

  const layers = [enemyIconLayer, playerIconLayer, labelLayer].filter(Boolean)

  return (
    <div style={overlay}>
      <div style={mapContainer}>
        <MapGL
          initialViewState={INITIAL_VIEW}
          style={{ width: '100%', height: '100%' }}
          mapStyle={mapStyle}
          onClick={handleMapClick}
          dragPan={true}
        >
          <DeckOverlay layers={layers} />
        </MapGL>

        <MapToggle />

        {/* Instruction banner */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: placementError ? 'rgba(80,0,0,0.9)' : 'rgba(0,0,0,0.85)',
            border: placementError ? '1px solid var(--status-damaged)' : '1px solid var(--border-accent)',
            borderRadius: 'var(--panel-radius)',
            padding: '8px 24px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-sm)',
            color: placementError ? 'var(--status-damaged)' : 'var(--text-accent)',
            transition: 'all 0.15s',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
        >
          {placementError ?? (selectedPlacedIndex != null
            ? `CLICK MAP TO REPOSITION: ${placedUnits[selectedPlacedIndex]?.entry.name ?? ''}`
            : allPlaced
              ? 'ALL PLACED — CLICK A UNIT TO REPOSITION, OR LAUNCH'
              : `CLICK MAP TO PLACE: ${activeUnit?.name ?? ''}`)}
        </div>
      </div>

      {/* Sidebar */}
      <div style={sidebar}>
        <div style={sidebarHeader}>
          <div
            style={{
              fontSize: 'var(--font-size-base)',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: 'var(--text-primary)',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            DEPLOYMENT
          </div>
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              letterSpacing: '0.05em',
            }}
          >
            Placing unit {Math.min(activeIndex + 1, unplacedUnits.length)} of{' '}
            {unplacedUnits.length}
          </div>
        </div>

        {/* Active unit info */}
        {activeUnit && (
          <div style={activeUnitBox}>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-accent)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {CATEGORY_LABELS[activeUnit.category] ?? activeUnit.category}
            </div>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: 4,
              }}
            >
              {activeUnit.name}
            </div>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                lineHeight: 1.4,
              }}
            >
              {activeUnit.description}
            </div>
          </div>
        )}

        {/* Unit list */}
        <div style={unitListContainer}>
          {unplacedUnits.map((entry, i) => {
            const isPlaced = i < activeIndex
            const isActive = i === activeIndex
            return (
              <div
                key={`${entry.id}-${i}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 16px',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  borderLeft: isActive
                    ? `3px solid ${selectedNation === 'usa' ? 'var(--usa-primary)' : 'var(--iran-primary)'}`
                    : '3px solid transparent',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: isPlaced
                      ? 'var(--status-ready)'
                      : isActive
                        ? 'var(--text-primary)'
                        : 'var(--text-muted)',
                    fontWeight: isActive ? 700 : 400,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isPlaced ? '\u2713 ' : ''}
                  {entry.name}
                </span>
                <span
                  style={{
                    fontSize: '0.6rem',
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                >
                  {CATEGORY_LABELS[entry.category] ?? entry.category}
                </span>
              </div>
            )
          })}

          {/* Enemy section */}
          <div
            style={{
              padding: '12px 16px 4px',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              color: enemyNation === 'usa' ? 'var(--usa-primary)' : 'var(--iran-primary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              borderTop: '1px solid var(--border-default)',
              marginTop: 8,
            }}
          >
            ENEMY FORCES ({enemyNation.toUpperCase()}) — {enemyUnits.length} UNITS
          </div>
          {enemyUnits.slice(0, 10).map(u => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '3px 16px',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--text-muted)',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {u.name}
              </span>
            </div>
          ))}
          {enemyUnits.length > 10 && (
            <div
              style={{
                padding: '3px 16px',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              +{enemyUnits.length - 10} more...
            </div>
          )}
        </div>

        {/* Buttons */}
        <div style={buttonBar}>
          <button
            onClick={handleBack}
            style={{
              background: 'none',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--panel-radius)',
              padding: '8px 16px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
              letterSpacing: '0.1em',
            }}
          >
            &larr; BACK
          </button>
          <button
            onClick={undoLast}
            disabled={placedUnits.length === 0}
            style={{
              background: 'none',
              border: `1px solid ${placedUnits.length > 0 ? 'var(--status-engaged)' : 'var(--border-default)'}`,
              borderRadius: 'var(--panel-radius)',
              padding: '8px 16px',
              cursor: placedUnits.length > 0 ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              color: placedUnits.length > 0 ? 'var(--status-engaged)' : 'var(--text-muted)',
              letterSpacing: '0.1em',
              opacity: placedUnits.length > 0 ? 1 : 0.5,
            }}
          >
            UNDO
          </button>
          <button
            onClick={handleLaunch}
            disabled={!allPlaced}
            style={{
              flex: 1,
              background: allPlaced ? 'var(--text-accent)' : 'transparent',
              border: allPlaced
                ? '1px solid var(--text-accent)'
                : '1px solid var(--border-default)',
              borderRadius: 'var(--panel-radius)',
              padding: '8px 16px',
              cursor: allPlaced ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 700,
              letterSpacing: '0.15em',
              color: allPlaced ? '#fff' : 'var(--text-muted)',
              textTransform: 'uppercase',
              opacity: allPlaced ? 1 : 0.5,
            }}
          >
            LAUNCH
          </button>
        </div>
      </div>
    </div>
  )
}
