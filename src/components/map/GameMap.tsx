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
import { createRangeRingGeoJSON } from './layers/RangeRingLayer'
import { createSupplyLineGeoJSON } from './layers/SupplyLineLayer'
import { ensureMainThreadGrid, getLOSPolygon } from './layers/LOSLayer'
import InfoTooltip from './InfoTooltip'
import MissileTracker from './MissileTracker'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { useStrikeStore } from '@/store/strike-store'
import { getMapStyle } from '@/styles/map-providers'

const INITIAL_VIEW = {
  longitude: 51.4,
  latitude: 27.5,
  zoom: 4.5,
  pitch: 0,
  bearing: 0,
}

const THEATER_COUNTRIES = ['IRN', 'IRQ', 'SAU', 'ARE', 'QAT', 'BHR', 'KWT', 'OMN', 'AFG', 'PAK', 'TUR']

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

  const selectedUnitId = useUIStore((s) => s.selectedUnitId)
  const selectedUnitIds = useUIStore((s) => s.selectedUnitIds)
  const hoveredUnitId = useUIStore((s) => s.hoveredUnitId)
  const selectUnit = useUIStore((s) => s.selectUnit)
  const hoverUnit = useUIStore((s) => s.hoverUnit)
  const showRangeRings = useUIStore((s) => s.showRangeRings)
  const showRadarLOS = useUIStore((s) => s.showRadarLOS)
  const mapMode = useUIStore((s) => s.mapMode)

  const mapStyle = useMemo(() => getMapStyle(mapMode), [mapMode])

  // Targeting state from strike-store (not ui-store compat shims)
  const targetUnitId = useStrikeStore((s) => s.targetUnitId)
  const targetingMode = useStrikeStore((s) => s.targetingMode)
  const setTarget = useStrikeStore((s) => s.setTargetUnitId)

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

  // Compute LOS polygon for hovered/selected radar unit
  const losPolygon = useMemo(() => {
    if (!gridReady) return null

    // Determine which unit to show LOS for:
    // 1. Selected radar unit — always show
    // 2. Hovered radar unit — only when showRadarLOS toggle is on
    const losUnitId = selectedUnitId ?? (showRadarLOS ? hoveredUnitId : null)
    if (!losUnitId) return null

    const unit = units.find((u) => u.id === losUnitId)
    if (!unit || unit.status === 'destroyed') return null

    // Find the best radar sensor on this unit
    const radarSensor = unit.sensors?.find((s) => s.type === 'radar')
    if (!radarSensor) return null

    const antennaHeight = radarSensor.antenna_height_m ?? 15 // default 15m
    return getLOSPolygon(losUnitId, unit.position, radarSensor.range_km, antennaHeight)
  }, [gridReady, selectedUnitId, hoveredUnitId, showRadarLOS, units])

  const onLoad = useCallback(() => {
    mapRef.current?.getMap()?.resize()
  }, [])

  const onContextMenu = useCallback((e: MapLayerMouseEvent) => {
    e.preventDefault()
    if (selectedUnitId) {
      setCtxMenu({ x: e.point.x, y: e.point.y, lngLat: e.lngLat, shiftKey: !!(e.originalEvent as MouseEvent)?.shiftKey })
    }
  }, [selectedUnitId])

  const onMapClick = useCallback(() => {
    setCtxMenu(null)
  }, [])

  const onMove = useCallback((evt: { viewState: { zoom: number } }) => {
    setZoom(evt.viewState.zoom)
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
    if (clickedUnit && clickedUnit.nation !== 'usa') {
      // Find nearest friendly unit with available offensive weapons
      const friendlies = units.filter(u =>
        u.nation === 'usa' && u.status !== 'destroyed' &&
        u.weapons.some(w => w.count > 0),
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

  const layers = useMemo(() => [
    ...createUnitLayer(units, selectedUnitId, hoveredUnitId, targetUnitId, targetingMode, handleHover, handleUnitClick, setTarget, selectedNation, zoom),
    ...createMissileLayers(missiles, currentTime, units, handleHover, handleMissileClick),
    ...createImpactLayers(allEvents, units, currentTick),
    ...createWaypointLayers(units, selectedUnitIds),
  ], [units, selectedUnitId, selectedUnitIds, hoveredUnitId, targetUnitId, targetingMode, handleHover, handleUnitClick, handleMissileClick, setTarget, selectedNation, zoom, missiles, currentTime, allEvents, currentTick])

  return (
    <>
      <MapGL
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={mapStyle}
        onLoad={onLoad}
        onMove={onMove}
        onContextMenu={onContextMenu}
        onClick={onMapClick}
        attributionControl={false}
        maxZoom={12}
        minZoom={2}
        cursor={targetingMode ? 'crosshair' : hoveredUnitId ? 'pointer' : 'grab'}
      >
        <DeckOverlay layers={layers} />

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
    </>
  )
}
