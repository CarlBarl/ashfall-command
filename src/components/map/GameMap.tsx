import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapToggle from '@/components/hud/MapToggle'
import MapGL, { Layer, Source } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre'
import DeckOverlay from './DeckOverlay'
import ContextMenu from './ContextMenu'
import { createUnitLayer, getLastClusterMap } from './layers/UnitLayer'
import ClusterPopup from './ClusterPopup'
import type { UnitCluster } from './layers/cluster'
import { createMissileLayers } from './layers/MissileLayer'
import { createImpactLayers } from './layers/ImpactLayer'
import { createWaypointLayers } from './layers/WaypointLayer'
import { createIntelUnitLayers } from './layers/IntelLayer'
import { createRouteLayers } from './layers/RouteLayer'
import circle from '@turf/circle'
import { createRangeRingGeoJSON } from './layers/RangeRingLayer'
import { createSupplyLineGeoJSON } from './layers/SupplyLineLayer'
import { ensureMainThreadGrid, getMainThreadGrid, getLOSPolygon } from './layers/LOSLayer'
import { generateElevationOverlay } from './layers/ElevationOverlay'
import InfoTooltip from './InfoTooltip'
import MissileTracker from './MissileTracker'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { useStrikeStore } from '@/store/strike-store'
import { useIntelStore } from '@/store/intel-store'
import { getMapStyle } from '@/styles/map-providers'
import { weaponSpecs } from '@/data/weapons/missiles'
import { iranCatalog } from '@/data/catalog/iran-catalog'
import { usaCatalog } from '@/data/catalog/usa-catalog'

const INITIAL_VIEW = {
  longitude: 51.4,
  latitude: 27.5,
  zoom: 4.5,
  pitch: 0,
  bearing: 0,
}

const THEATER_COUNTRIES = ['IRQ', 'SAU', 'ARE', 'QAT', 'BHR', 'KWT', 'OMN', 'AFG', 'PAK', 'TUR']

interface CtxMenu {
  x: number
  y: number
  lngLat: { lng: number; lat: number }
  shiftKey: boolean
}

export default function GameMap() {
  const mapRef = useRef<MapRef>(null)
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const hoverPosRef = useRef({ x: 0, y: 0 })
  const [clusterPopup, setClusterPopup] = useState<{ cluster: UnitCluster; x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom)
  const [followedMissileId, setFollowedMissileId] = useState<string | null>(null)
  const [cursorElev, setCursorElev] = useState<number | null>(null)
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null)

  const selectedUnitId = useUIStore((s) => s.selectedUnitId)
  const selectedUnitIds = useUIStore((s) => s.selectedUnitIds)
  const hoveredUnitId = useUIStore((s) => s.hoveredUnitId)
  const selectUnit = useUIStore((s) => s.selectUnit)
  const hoverUnit = useUIStore((s) => s.hoverUnit)
  const showRangeRings = useUIStore((s) => s.showRangeRings)
  const showRadarLOS = useUIStore((s) => s.showRadarLOS)
  const showElevation = useUIStore((s) => s.showElevation)
  const mapMode = useUIStore((s) => s.mapMode)

  const mapStyle = useMemo(() => getMapStyle(mapMode), [mapMode])

  // Targeting state from strike-store (not ui-store compat shims)
  const targetUnitId = useStrikeStore((s) => s.targetUnitId)
  const targetingMode = useStrikeStore((s) => s.targetingMode)
  const setTarget = useStrikeStore((s) => s.setTargetUnitId)
  const routingMode = useStrikeStore((s) => s.routingMode)
  const routeWaypoints = useStrikeStore((s) => s.routeWaypoints)
  const addRouteWaypoint = useStrikeStore((s) => s.addRouteWaypoint)

  // Intel placement mode + estimated units
  const placingCatalogId = useIntelStore((s) => s.placingCatalogId)
  const estimatedUnits = useIntelStore((s) => s.estimatedUnits)

  // Get selected unit's nation for targeting
  const units = useGameStore((s) => s.viewState.units)
  const selectedUnit = units.find(u => u.id === selectedUnitId)
  const selectedNation = selectedUnit?.nation ?? null
  const missiles = useGameStore((s) => s.viewState.missiles)
  const allEvents = useGameStore((s) => s.eventLog)
  const currentTime = useGameStore((s) => s.visualTimestamp)
  const currentTick = useGameStore((s) => s.viewState.time.tick)
  const supplyLines = useGameStore((s) => s.viewState.supplyLines)

  useEffect(() => {
    fetch('/geo/ne_50m_admin_0.geojson')
      .then(r => r.json())
      .then(setGeoData)
  }, [])

  // Load elevation grid on main thread for LOS visualization
  const [gridReady, setGridReady] = useState(false)
  useEffect(() => {
    ensureMainThreadGrid().then(() => setGridReady(true)).catch(() => {})
  }, [])

  // Generate elevation overlay image (static, computed once when grid is ready)
  const elevationOverlay = useMemo(() => {
    if (!gridReady || !showElevation) return null
    const grid = getMainThreadGrid()
    if (!grid) return null
    return generateElevationOverlay(grid)
  }, [gridReady, showElevation])

  const showIntelCoverage = useUIStore((s) => s.showIntelCoverage)

  // Compute radar coverage circles for estimated intel units (only when toggle on)
  const intelCoverageData = useMemo(() => {
    if (!showIntelCoverage) return { type: 'FeatureCollection' as const, features: [] }
    const features = estimatedUnits
      .filter((u) => u.sensors.some((s) => s.type === 'radar'))
      .map((u) => {
        const radar = u.sensors.find((s) => s.type === 'radar')!
        return circle([u.position.lng, u.position.lat], radar.range_km, { units: 'kilometers', steps: 64 })
      })
    return { type: 'FeatureCollection' as const, features }
  }, [estimatedUnits, showIntelCoverage])

  // Compute LOS polygon(s)
  // 1. Selected unit — always show its LOS (regardless of toggle)
  // 2. LOS toggle on — show ALL radar coverage for enemy AND friendly as range circles
  const losPolygon = useMemo(() => {
    if (!gridReady) return null

    // Priority: hovered unit (when LOS toggle on) > selected unit
    const candidates: (string | null)[] = [
      showRadarLOS ? hoveredUnitId : null,
      selectedUnitId,
    ]

    for (const candidateId of candidates) {
      if (!candidateId) continue
      const unit = units.find((u) => u.id === candidateId)
      if (!unit || unit.status === 'destroyed') continue

      const radarSensor = unit.sensors?.find((s) => s.type === 'radar')
      if (!radarSensor) continue

      const antennaHeight = radarSensor.antenna_height_m ?? 15
      const sectorDeg = radarSensor.sector_deg ?? 360
      return getLOSPolygon(candidateId, unit.position, radarSensor.range_km, antennaHeight, unit.heading, sectorDeg)
    }

    return null
  }, [gridReady, selectedUnitId, hoveredUnitId, showRadarLOS, units])

  // Map-wide radar range circles when RNG toggle is on
  const allRadarCoverage = useMemo(() => {
    if (!showRangeRings) return null
    const pNation = useGameStore.getState().viewState.playerNation
    const features = units
      .filter(u => u.status !== 'destroyed' && u.sensors?.some(s => s.type === 'radar'))
      .map(u => {
        const radar = u.sensors!.find(s => s.type === 'radar')!
        const isEnemy = u.nation !== pNation
        return {
          ...circle([u.position.lng, u.position.lat], radar.range_km, { units: 'kilometers', steps: 64 }),
          properties: { isEnemy },
        }
      })
    return { type: 'FeatureCollection' as const, features }
  }, [showRangeRings, units])

  const onLoad = useCallback(() => {
    mapRef.current?.getMap()?.resize()
  }, [])

  const onContextMenu = useCallback((e: MapLayerMouseEvent) => {
    e.preventDefault()
    if (selectedUnitId) {
      setCtxMenu({ x: e.point.x, y: e.point.y, lngLat: e.lngLat, shiftKey: !!(e.originalEvent as MouseEvent)?.shiftKey })
    }
  }, [selectedUnitId])

  const onMapClick = useCallback((e: MapLayerMouseEvent) => {
    setCtxMenu(null)

    // Route planning mode: add waypoint on map click
    const strikeState = useStrikeStore.getState()
    if (strikeState.routingMode && e.lngLat) {
      addRouteWaypoint({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      return // Don't do normal click processing
    }

    // Intel placement mode: if placingCatalogId is set, place an estimate
    const intelState = useIntelStore.getState()
    if (intelState.placingCatalogId) {
      const pNation = useGameStore.getState().viewState.playerNation
      const catalog = pNation === 'usa' ? iranCatalog : usaCatalog
      const entry = catalog.find((c) => c.id === intelState.placingCatalogId)
      if (entry && e.lngLat) {
        intelState.addEstimate(entry, { lat: e.lngLat.lat, lng: e.lngLat.lng })
      }
      return // Don't do normal click processing
    }
  }, [addRouteWaypoint])

  const onMove = useCallback((evt: { viewState: { zoom: number }; lngLat?: { lat: number; lng: number } }) => {
    setZoom(evt.viewState.zoom)
  }, [])

  const onMouseMove = useCallback((evt: MapLayerMouseEvent) => {
    const grid = getMainThreadGrid()
    if (grid && evt.lngLat) {
      const elev = grid.getElevation(evt.lngLat.lat, evt.lngLat.lng)
      setCursorElev(elev)
      setCursorCoords({ lat: evt.lngLat.lat, lng: evt.lngLat.lng })
    }
  }, [])

  const handleHover = useCallback((id: string | null, x?: number, y?: number) => {
    hoverUnit(id)
    if (x !== undefined && y !== undefined) {
      setHoverPos({ x, y })
      hoverPosRef.current = { x, y }
    }
  }, [hoverUnit])

  const handleUnitClick = useCallback((id: string | null) => {
    if (!id) return
    const clusterMap = getLastClusterMap()
    const cluster = clusterMap.get(id)
    if (cluster) {
      setClusterPopup({ cluster, x: hoverPosRef.current.x, y: hoverPosRef.current.y })
      return
    }
    setClusterPopup(null)

    // Check if clicked unit is an enemy — set as target and auto-select nearest armed friendly
    const clickedUnit = units.find(u => u.id === id)
    const pNation = useGameStore.getState().viewState.playerNation
    if (clickedUnit && clickedUnit.nation !== pNation) {
      // Find nearest friendly unit with available OFFENSIVE weapons (not SAMs)
      const friendlies = units.filter(u =>
        u.nation === pNation && u.status !== 'destroyed' &&
        u.weapons.some(w => {
          const spec = weaponSpecs[w.weaponId]
          return spec && spec.type !== 'sam' && w.count > 0
        }),
      )
      if (friendlies.length > 0) {
        const tLat = clickedUnit.position.lat
        const tLng = clickedUnit.position.lng
        let nearest = friendlies[0]
        let bestDist = Infinity
        for (const f of friendlies) {
          const dLat = f.position.lat - tLat
          const dLng = f.position.lng - tLng
          const d = dLat * dLat + dLng * dLng
          if (d < bestDist) { bestDist = d; nearest = f }
        }
        selectUnit(nearest.id)
      }
      setTarget(id)
      return
    }
    selectUnit(id)
  }, [selectUnit, setTarget, units])

  const handleMissileClick = useCallback((id: string) => {
    setFollowedMissileId(prev => prev === id ? null : id)
  }, [])

  // Auto-clear followed missile when it's no longer inflight
  useEffect(() => {
    if (!followedMissileId) return
    const found = missiles.find(m => m.id === followedMissileId && m.status === 'inflight')
    if (!found) {
      setFollowedMissileId(null)
    }
  }, [followedMissileId, missiles])

  const followedMissile = followedMissileId
    ? missiles.find(m => m.id === followedMissileId && m.status === 'inflight') ?? null
    : null

  // Compute route layers when in routing mode
  const routeLayers = useMemo(() => {
    if (!routingMode) return []
    const pNation = useGameStore.getState().viewState.playerNation
    // Find launcher and target for the route
    const strikeState = useStrikeStore.getState()
    const launcherUnit = units.find(u => u.id === (useUIStore.getState().selectedUnitId))
    const targetUnit = units.find(u => u.id === strikeState.targetUnitId)
    if (!launcherUnit || !targetUnit) return []

    // Collect enemy radars: detected enemy units + intel estimates
    const enemyRadars: { position: { lat: number; lng: number }; range_km: number }[] = []
    for (const u of units) {
      if (u.nation === pNation || u.status === 'destroyed') continue
      for (const s of u.sensors ?? []) {
        if (s.type === 'radar') {
          enemyRadars.push({ position: u.position, range_km: s.range_km })
        }
      }
    }
    for (const eu of estimatedUnits) {
      for (const s of eu.sensors) {
        if (s.type === 'radar') {
          enemyRadars.push({ position: eu.position, range_km: s.range_km })
        }
      }
    }

    return createRouteLayers(launcherUnit.position, routeWaypoints, targetUnit.position, enemyRadars)
  }, [routingMode, routeWaypoints, units, estimatedUnits])

  const layers = useMemo(() => [
    ...createUnitLayer(units, selectedUnitId, hoveredUnitId, targetUnitId, targetingMode, handleHover, handleUnitClick, setTarget, selectedNation, zoom),
    ...createMissileLayers(missiles, currentTime, units, handleHover, handleMissileClick),
    ...createImpactLayers(allEvents, units, currentTick),
    ...createWaypointLayers(units, selectedUnitIds),
    ...createIntelUnitLayers(estimatedUnits),
    ...routeLayers,
  ], [units, selectedUnitId, selectedUnitIds, hoveredUnitId, targetUnitId, targetingMode, handleHover, handleUnitClick, handleMissileClick, setTarget, selectedNation, zoom, missiles, currentTime, allEvents, currentTick, estimatedUnits, routeLayers])

  return (
    <>
      <MapGL
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        onLoad={onLoad}
        onMove={onMove}
        onMouseMove={onMouseMove}
        onContextMenu={onContextMenu}
        onClick={onMapClick}
        attributionControl={false}
        maxZoom={12}
        minZoom={2}
        cursor={routingMode ? 'crosshair' : placingCatalogId ? 'crosshair' : targetingMode ? 'crosshair' : hoveredUnitId ? 'pointer' : 'grab'}
      >
        <DeckOverlay layers={layers} />

        {elevationOverlay && (
          <Source
            id="elevation-overlay"
            type="image"
            url={elevationOverlay.dataUrl}
            coordinates={[
              [elevationOverlay.bounds[0], elevationOverlay.bounds[3]], // top-left [west, north]
              [elevationOverlay.bounds[2], elevationOverlay.bounds[3]], // top-right [east, north]
              [elevationOverlay.bounds[2], elevationOverlay.bounds[1]], // bottom-right [east, south]
              [elevationOverlay.bounds[0], elevationOverlay.bounds[1]], // bottom-left [west, south]
            ]}
          >
            <Layer
              id="elevation-raster"
              type="raster"
              paint={{
                'raster-opacity': 0.6,
                'raster-fade-duration': 0,
              }}
            />
          </Source>
        )}

        {supplyLines.length > 0 && (
          <Source id="supply-lines" type="geojson" data={createSupplyLineGeoJSON(supplyLines, units)}>
            <Layer
              id="supply-line-healthy"
              type="line"
              filter={['==', ['get', 'status'], 'healthy']}
              paint={{
                'line-color': '#1a4a2a',
                'line-width': 0.5,
                'line-opacity': 0.15,
                'line-dasharray': [4, 6],
              }}
            />
            <Layer
              id="supply-line-damaged"
              type="line"
              filter={['==', ['get', 'status'], 'damaged']}
              paint={{
                'line-color': '#8b6914',
                'line-width': 0.5,
                'line-opacity': 0.25,
                'line-dasharray': [2, 6],
              }}
            />
            <Layer
              id="supply-line-cut"
              type="line"
              filter={['==', ['get', 'status'], 'cut']}
              paint={{
                'line-color': '#8b0000',
                'line-width': 0.5,
                'line-opacity': 0.3,
                'line-dasharray': [1, 4],
              }}
            />
          </Source>
        )}

        {losPolygon && (
          <Source id="los-coverage" type="geojson" data={losPolygon}>
            <Layer
              id="los-fill"
              type="fill"
              paint={{
                'fill-color': '#22cc44',
                'fill-opacity': 0.12,
              }}
            />
            <Layer
              id="los-outline"
              type="line"
              paint={{
                'line-color': '#22cc44',
                'line-opacity': 0.3,
                'line-width': 1,
              }}
            />
          </Source>
        )}

        {allRadarCoverage && allRadarCoverage.features.length > 0 && (
          <Source id="all-radar-coverage" type="geojson" data={allRadarCoverage as GeoJSON.FeatureCollection}>
            <Layer
              id="radar-coverage-friendly"
              type="fill"
              filter={['==', ['get', 'isEnemy'], false]}
              paint={{
                'fill-color': '#4488cc',
                'fill-opacity': 0.06,
              }}
            />
            <Layer
              id="radar-coverage-enemy"
              type="fill"
              filter={['==', ['get', 'isEnemy'], true]}
              paint={{
                'fill-color': '#cc4444',
                'fill-opacity': 0.08,
              }}
            />
            <Layer
              id="radar-coverage-outline-friendly"
              type="line"
              filter={['==', ['get', 'isEnemy'], false]}
              paint={{
                'line-color': '#4488cc',
                'line-opacity': 0.2,
                'line-width': 1,
              }}
            />
            <Layer
              id="radar-coverage-outline-enemy"
              type="line"
              filter={['==', ['get', 'isEnemy'], true]}
              paint={{
                'line-color': '#cc4444',
                'line-opacity': 0.3,
                'line-width': 1,
              }}
            />
          </Source>
        )}

        {intelCoverageData.features.length > 0 && (
          <Source id="intel-coverage" type="geojson" data={intelCoverageData}>
            <Layer
              id="intel-coverage-fill"
              type="fill"
              paint={{
                'fill-color': '#ff8800',
                'fill-opacity': 0.06,
              }}
            />
            <Layer
              id="intel-coverage-line"
              type="line"
              paint={{
                'line-color': '#ff8800',
                'line-opacity': 0.3,
                'line-width': 1,
                'line-dasharray': [4, 4],
              }}
            />
          </Source>
        )}

        {geoData && (
          <Source id="countries" type="geojson" data={geoData}>
            <Layer
              id="country-fill"
              type="fill"
              paint={{
                'fill-color': [
                  'match',
                  ['get', 'iso_a3'],
                  'IRN', '#1a1520',
                  'USA', '#151a28',
                  ...THEATER_COUNTRIES.flatMap(c => [c, '#141822']),
                  '#111620',
                ],
                'fill-opacity': 0.6,
              }}
            />
            <Layer
              id="country-borders"
              type="line"
              paint={{
                'line-color': [
                  'match',
                  ['get', 'iso_a3'],
                  'IRN', '#553333',
                  'USA', '#334455',
                  '#2d4a3e',
                ],
                'line-width': ['match', ['get', 'iso_a3'], 'IRN', 1.5, 0.6],
                'line-opacity': 0.7,
              }}
            />
            <Layer
              id="iran-glow"
              type="line"
              filter={['==', ['get', 'iso_a3'], 'IRN']}
              paint={{
                'line-color': '#cc4444',
                'line-width': 2,
                'line-opacity': 0.3,
                'line-blur': 3,
              }}
            />
          </Source>
        )}
        {showRangeRings && (() => {
          const rangeData = createRangeRingGeoJSON(units)
          return (
            <Source id="range-rings" type="geojson" data={rangeData}>
              <Layer
                id="range-ring-fill"
                type="fill"
                paint={{
                  'fill-color': ['get', 'fill'],
                  'fill-opacity': 0.08,
                }}
              />
              <Layer
                id="range-ring-stroke-sam"
                type="line"
                filter={['==', ['get', 'ringType'], 'sam']}
                paint={{
                  'line-color': ['get', 'stroke'],
                  'line-width': 1,
                  'line-opacity': 0.3,
                }}
              />
              <Layer
                id="range-ring-stroke-missile"
                type="line"
                filter={['==', ['get', 'ringType'], 'missile']}
                paint={{
                  'line-color': ['get', 'stroke'],
                  'line-width': 1,
                  'line-opacity': 0.3,
                  'line-dasharray': [4, 4],
                }}
              />
            </Source>
          )
        })()}
        {/* Range rings for selected unit(s) — always visible, brighter */}
        {selectedUnitId && (() => {
          const selUnits = units.filter(u => u.id === selectedUnitId)
          if (selUnits.length === 0) return null
          const ringData = createRangeRingGeoJSON(selUnits)
          if (ringData.features.length === 0) return null
          return (
            <Source id="selected-range-rings" type="geojson" data={ringData}>
              <Layer
                id="sel-ring-fill"
                type="fill"
                paint={{
                  'fill-color': ['get', 'fill'],
                  'fill-opacity': 0.15,
                }}
              />
              <Layer
                id="sel-ring-stroke"
                type="line"
                paint={{
                  'line-color': ['get', 'stroke'],
                  'line-width': 1.5,
                  'line-opacity': 0.5,
                }}
              />
            </Source>
          )
        })()}
      </MapGL>

      <InfoTooltip x={hoverPos.x} y={hoverPos.y} />

      {followedMissile && (
        <MissileTracker
          missile={followedMissile}
          mapRef={mapRef}
          units={units}
          currentTime={currentTime}
          onClose={() => setFollowedMissileId(null)}
        />
      )}

      {clusterPopup && (
        <ClusterPopup
          cluster={clusterPopup.cluster}
          x={clusterPopup.x}
          y={clusterPopup.y}
          onClose={() => setClusterPopup(null)}
        />
      )}

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          lngLat={ctxMenu.lngLat}
          shiftKey={ctxMenu.shiftKey}
          onClose={() => setCtxMenu(null)}
        />
      )}

      <MapToggle />

      {/* Cursor elevation readout */}
      {showElevation && cursorElev != null && cursorCoords && (
        <div
          style={{
            position: 'fixed',
            bottom: 8,
            right: 8,
            background: 'rgba(0,0,0,0.8)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--panel-radius)',
            padding: '4px 10px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            color: cursorElev <= 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
            letterSpacing: '0.05em',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {cursorElev <= 0
            ? 'SEA LEVEL'
            : `${Math.round(cursorElev)}m`}
          {' '}
          <span style={{ color: 'var(--text-muted)' }}>
            {cursorCoords.lat.toFixed(2)}N {cursorCoords.lng.toFixed(2)}E
          </span>
        </div>
      )}
    </>
  )
}
