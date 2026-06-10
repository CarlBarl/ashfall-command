import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapToggle from '@/components/hud/MapToggle'
import MapGL, { Layer, Source } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre'
import DeckOverlay from './DeckOverlay'
import ContextMenu from './ContextMenu'
import type { PickingInfo } from '@deck.gl/core'
import { createUnitLayer, createSatelliteDetectionLayer, getLastClusterMap } from './layers/UnitLayer'
import ClusterPopup from './ClusterPopup'
import type { UnitCluster } from './layers/cluster'
import { createMissileLayers } from './layers/MissileLayer'
import { createImpactLayers } from './layers/ImpactLayer'
import { createWaypointLayers } from './layers/WaypointLayer'
import { createIntelUnitLayers } from './layers/IntelLayer'
import { createRouteLayers } from './layers/RouteLayer'
// circle import removed — range rings handled by RangeRingLayer
import { createRangeRingGeoJSONCached, ringSignature } from './layers/RangeRingLayer'
import { createSupplyLineGeoJSON } from './layers/SupplyLineLayer'
import { createShippingLaneGeoJSON } from './layers/ShippingLaneLayer'
import { createMinefieldGeoJSON } from './layers/MinefieldLayer'
import { ensureMainThreadGrid, getMainThreadGrid, getLOSPolygon } from './layers/LOSLayer'
import { generateElevationOverlay } from './layers/ElevationOverlay'
import InfoTooltip from './InfoTooltip'
import MissileTracker from './MissileTracker'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { useStrikeStore } from '@/store/strike-store'
import { useIntelStore } from '@/store/intel-store'
import { useMenuStore } from '@/store/menu-store'
import { getMapStyle } from '@/styles/map-providers'
import { weaponSpecs } from '@/data/weapons/missiles'
import { iranCatalog } from '@/data/catalog/iran-catalog'
import { usaCatalog } from '@/data/catalog/usa-catalog'

const DEFAULT_VIEW = {
  longitude: 51.4,
  latitude: 27.5,
  zoom: 4.5,
  pitch: 0,
  bearing: 0,
}

interface CtxMenu {
  x: number
  y: number
  lngLat: { lng: number; lat: number }
  shiftKey: boolean
}

export default function GameMap() {
  const mapRef = useRef<MapRef>(null)
  const scenarioMapCenter = useMenuStore((s) => s.mapCenter)
  const initialView = useMemo(() => {
    if (!scenarioMapCenter) return DEFAULT_VIEW
    return { ...DEFAULT_VIEW, ...scenarioMapCenter }
  }, [scenarioMapCenter])

  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const hoverPosRef = useRef({ x: 0, y: 0 })
  const [clusterPopup, setClusterPopup] = useState<{ cluster: UnitCluster; x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(initialView.zoom)
  const [followedMissileId, setFollowedMissileId] = useState<string | null>(null)
  const [cursorElev, setCursorElev] = useState<number | null>(null)
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null)

  const selectedUnitId = useUIStore((s) => s.selectedUnitId)
  const selectedUnitIds = useUIStore((s) => s.selectedUnitIds)
  const hoveredUnitId = useUIStore((s) => s.hoveredUnitId)
  const selectUnit = useUIStore((s) => s.selectUnit)
  const hoverUnit = useUIStore((s) => s.hoverUnit)
  const rngFilter = useUIStore((s) => s.rngFilter)
  const showElevation = useUIStore((s) => s.showElevation)
  const mapMode = useUIStore((s) => s.mapMode)
  const mapFocus = useUIStore((s) => s.mapFocus)

  // Fly-to requests (AlertFeed click-to-zoom) — visual only, keyed by nonce
  useEffect(() => {
    if (!mapFocus) return
    mapRef.current?.flyTo({
      center: [mapFocus.lng, mapFocus.lat],
      duration: 1200,
      ...(mapFocus.zoom !== undefined ? { zoom: mapFocus.zoom } : {}),
    })
  }, [mapFocus])

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
  const shippingLanes = useGameStore((s) => s.viewState.shippingLanes)
  const playerNation = useGameStore((s) => s.viewState.playerNation)
  const satelliteDetectedUnitIds = useGameStore((s) => s.viewState.satelliteDetectedUnitIds)

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

  // Compute terrain-masked LOS for estimated intel units (only when toggle on)
  const intelLOSPolygons = useMemo(() => {
    if (!showIntelCoverage || !gridReady) return []
    return estimatedUnits
      .filter(u => u.sensors.some(s => s.type === 'radar'))
      .map(u => {
        const radar = u.sensors.find(s => s.type === 'radar')!
        return getLOSPolygon(
          `intel_${u.id}`, u.position, radar.range_km,
          radar.antenna_height_m ?? 15, 0, radar.sector_deg ?? 360,
        )
      })
      .filter(Boolean) as NonNullable<ReturnType<typeof getLOSPolygon>>[]
  }, [estimatedUnits, showIntelCoverage, gridReady])

  // Compute LOS polygon(s) for hovered or selected radar unit(s)
  // Handles clusters: hovering a cluster shows LOS for all radar units in it
  const losPolygons = useMemo(() => {
    if (!gridReady) return []

    const results: ReturnType<typeof getLOSPolygon>[] = []
    const candidates: (string | null)[] = [hoveredUnitId, selectedUnitId]

    for (const candidateId of candidates) {
      if (!candidateId) continue

      // Check if it's a cluster
      const clusterMap = getLastClusterMap()
      const cluster = clusterMap.get(candidateId)
      const unitIds = cluster ? cluster.units.map(u => u.id) : [candidateId]

      for (const uid of unitIds) {
        const unit = units.find(u => u.id === uid)
        if (!unit || unit.status === 'destroyed') continue
        const radarSensor = unit.sensors?.find(s => s.type === 'radar')
        if (!radarSensor) continue

        const antennaHeight = radarSensor.antenna_height_m ?? 15
        const sectorDeg = radarSensor.sector_deg ?? 360
        const poly = getLOSPolygon(uid, unit.position, radarSensor.range_km, antennaHeight, unit.heading, sectorDeg)
        if (poly) results.push(poly)
      }

      if (results.length > 0) break // use first candidate that has results
    }

    return results
  }, [gridReady, selectedUnitId, hoveredUnitId, units])

  // Map-wide terrain-masked LOS when losFilter is not 'off'
  const losFilter = useUIStore((s) => s.losFilter)
  const allLOSPolygons = useMemo(() => {
    if (losFilter === 'off' || !gridReady) return []
    const pNation = useGameStore.getState().viewState.playerNation

    return units
      .filter(u => {
        if (u.status === 'destroyed') return false
        if (!u.sensors?.some(s => s.type === 'radar')) return false
        if (losFilter === 'friendly' && u.nation !== pNation) return false
        if (losFilter === 'enemy' && u.nation === pNation) return false
        return true
      })
      .map(u => {
        const radar = u.sensors!.find(s => s.type === 'radar')!
        const poly = getLOSPolygon(
          u.id, u.position, radar.range_km,
          radar.antenna_height_m ?? 15, u.heading, radar.sector_deg ?? 360,
        )
        return poly ? { poly, isEnemy: u.nation !== pNation } : null
      })
      .filter(Boolean) as { poly: NonNullable<ReturnType<typeof getLOSPolygon>>; isEnemy: boolean }[]
  }, [losFilter, gridReady, units])

  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap()
    map?.resize()
  }, [])

  const onContextMenu = useCallback((e: MapLayerMouseEvent) => {
    e.preventDefault()
    if (selectedUnitId) {
      setCtxMenu({ x: e.point.x, y: e.point.y, lngLat: e.lngLat, shiftKey: !!(e.originalEvent as MouseEvent)?.shiftKey })
    }
  }, [selectedUnitId])

  // Set by the deck.gl overlay when a click hit a pickable object — both deck and
  // maplibre receive every map click, so onMapClick must not treat unit clicks as empty-map clicks
  const deckClickConsumedRef = useRef(false)
  const onDeckClick = useCallback((info: PickingInfo) => {
    if (info.layer) deckClickConsumedRef.current = true
  }, [])

  const onMapClick = useCallback((e: MapLayerMouseEvent) => {
    setCtxMenu(null)
    setClusterPopup(null)

    const lngLat = e.lngLat
    // deck's click handler runs after this one in the same event dispatch — defer
    // so clicks consumed by deck objects skip the waypoint/estimate/deselect logic
    queueMicrotask(() => {
      const consumed = deckClickConsumedRef.current
      deckClickConsumedRef.current = false
      if (consumed) return

      // Route planning mode: add waypoint on map click
      const strikeState = useStrikeStore.getState()
      if (strikeState.routingMode && lngLat) {
        addRouteWaypoint({ lat: lngLat.lat, lng: lngLat.lng })
        return // Don't do normal click processing
      }

      // Intel placement mode: if placingCatalogId is set, place an estimate
      const intelState = useIntelStore.getState()
      if (intelState.placingCatalogId) {
        const pNation = useGameStore.getState().viewState.playerNation
        const catalog = pNation === 'usa' ? iranCatalog : usaCatalog
        const entry = catalog.find((c) => c.id === intelState.placingCatalogId)
        if (entry && lngLat) {
          intelState.addEstimate(entry, { lat: lngLat.lat, lng: lngLat.lng })
        }
        return // Don't do normal click processing
      }

      // Clicking empty map: deselect units and close all panels
      useUIStore.getState().clearSelection()
      hoverUnit(null)
      // Close desktop panels
      useUIStore.setState({ leftPanel: null, showOrbat: false, showStats: false, showEconomy: false, showIntel: false })
      useStrikeStore.getState().closeStrike()
    })
  }, [addRouteWaypoint, hoverUnit])

  const onMove = useCallback((evt: { viewState: { zoom: number }; lngLat?: { lat: number; lng: number } }) => {
    setZoom(evt.viewState.zoom)
  }, [])

  const onMouseMove = useCallback((evt: MapLayerMouseEvent) => {
    if (!showElevation) return
    const grid = getMainThreadGrid()
    if (grid && evt.lngLat) {
      const elev = grid.getElevation(evt.lngLat.lat, evt.lngLat.lng)
      setCursorElev(elev)
      setCursorCoords({ lat: evt.lngLat.lat, lng: evt.lngLat.lng })
    }
  }, [showElevation])

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
    const launcherUnit = units.find(u => u.id === (strikeState.activeLauncherId ?? useUIStore.getState().selectedUnitId))
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

  // Split layer groups so the per-frame visualTimestamp only rebuilds the missile layers
  const satelliteLayer = useMemo(
    () => createSatelliteDetectionLayer(units, satelliteDetectedUnitIds),
    [units, satelliteDetectedUnitIds])
  const unitLayers = useMemo(
    () => createUnitLayer(units, selectedUnitId, hoveredUnitId, targetUnitId, targetingMode, handleHover, handleUnitClick, setTarget, selectedNation, zoom),
    [units, selectedUnitId, hoveredUnitId, targetUnitId, targetingMode, handleHover, handleUnitClick, setTarget, selectedNation, zoom])
  const missileLayers = useMemo(
    () => createMissileLayers(missiles, currentTime, units, handleHover, handleMissileClick),
    [missiles, currentTime, units, handleHover, handleMissileClick])
  const impactLayers = useMemo(
    () => createImpactLayers(allEvents, units, currentTick),
    [allEvents, units, currentTick])
  const waypointLayers = useMemo(
    () => createWaypointLayers(units, selectedUnitIds),
    [units, selectedUnitIds])
  const intelLayers = useMemo(
    () => createIntelUnitLayers(estimatedUnits),
    [estimatedUnits])

  const layers = useMemo(() => [
    satelliteLayer,
    ...unitLayers,
    ...missileLayers,
    ...impactLayers,
    ...waypointLayers,
    ...intelLayers,
    ...routeLayers,
  ], [satelliteLayer, unitLayers, missileLayers, impactLayers, waypointLayers, intelLayers, routeLayers])

  // Memoize maplibre GeoJSON sources — these were rebuilt in the render body every
  // animation frame (the range rings even run turf union chains)
  const supplyLineData = useMemo(
    () => createSupplyLineGeoJSON(supplyLines, units),
    [supplyLines, units])
  const shippingLaneData = useMemo(
    () => createShippingLaneGeoJSON(shippingLanes),
    [shippingLanes])
  const minefieldData = useMemo(
    () => createMinefieldGeoJSON(units),
    [units])

  const rangeRingUnits = useMemo(() => {
    if (rngFilter === 'off') return []
    if (rngFilter === 'both') return units
    return rngFilter === 'friendly'
      ? units.filter(u => u.nation === playerNation)
      : units.filter(u => u.nation !== playerNation)
  }, [units, rngFilter, playerNation])
  const rangeRingSig = useMemo(() => ringSignature(rangeRingUnits), [rangeRingUnits])
  const rangeRingData = rangeRingUnits.length > 0
    ? createRangeRingGeoJSONCached('rng-overlay', rangeRingUnits, rangeRingSig)
    : null

  const selRingUnits = useMemo(
    () => selectedUnitId ? units.filter(u => u.id === selectedUnitId) : [],
    [units, selectedUnitId])
  const selRingSig = useMemo(() => ringSignature(selRingUnits), [selRingUnits])
  const selRingData = selRingUnits.length > 0
    ? createRangeRingGeoJSONCached('selected', selRingUnits, selRingSig)
    : null

  return (
    <>
      <MapGL
        ref={mapRef}
        initialViewState={initialView}
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
        <DeckOverlay layers={layers} onClick={onDeckClick} />

        {/* Invisible z-order anchor: country layers insert below it (beforeId), overlays
            append above it — keeps fills under supply lines/minefields/LOS across
            style toggles and async source mounts */}
        <Layer
          id="overlay-anchor"
          type="background"
          paint={{ 'background-color': 'rgba(0, 0, 0, 0)' }}
        />

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
          <Source id="supply-lines" type="geojson" data={supplyLineData}>
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

        {shippingLanes.length > 0 && (
          <Source id="shipping-lanes" type="geojson" data={shippingLaneData}>
            <Layer
              id="shipping-lane-open"
              type="line"
              filter={['==', ['get', 'status'], 'open']}
              paint={{
                'line-color': '#00bbcc',
                'line-width': 2,
                'line-opacity': 0.5,
                'line-dasharray': [8, 4],
              }}
            />
            <Layer
              id="shipping-lane-reduced"
              type="line"
              filter={['==', ['get', 'status'], 'reduced']}
              paint={{
                'line-color': '#e08800',
                'line-width': 2.5,
                'line-opacity': 0.7,
                'line-dasharray': [4, 4],
              }}
            />
            <Layer
              id="shipping-lane-blocked"
              type="line"
              filter={['==', ['get', 'status'], 'blocked']}
              paint={{
                'line-color': '#cc2222',
                'line-width': 3,
                'line-opacity': 0.8,
                'line-dasharray': [2, 3],
              }}
            />
          </Source>
        )}

        {minefieldData.features.length > 0 && (
          <Source id="minefields" type="geojson" data={minefieldData}>
            <Layer
              id="minefield-fill"
              type="fill"
              paint={{
                'fill-color': 'rgba(180, 30, 30, 0.12)',
                'fill-opacity': 0.8,
              }}
            />
            <Layer
              id="minefield-stroke"
              type="line"
              paint={{
                'line-color': 'rgba(200, 50, 50, 0.6)',
                'line-width': 1.5,
                'line-dasharray': [3, 3],
              }}
            />
          </Source>
        )}

        {losPolygons.map((poly, i) => (
          <Source key={`los-${i}`} id={`los-coverage-${i}`} type="geojson" data={poly}>
            <Layer
              id={`los-fill-${i}`}
              type="fill"
              paint={{
                'fill-color': '#22cc44',
                'fill-opacity': 0.12,
              }}
            />
            <Layer
              id={`los-outline-${i}`}
              type="line"
              paint={{
                'line-color': '#22cc44',
                'line-opacity': 0.3,
                'line-width': 1,
              }}
            />
          </Source>
        ))}

        {allLOSPolygons.map((item, i) => (
          <Source key={`maplos-${i}`} id={`maplos-${i}`} type="geojson" data={item.poly}>
            <Layer
              id={`maplos-fill-${i}`}
              type="fill"
              paint={{
                'fill-color': item.isEnemy ? '#cc4444' : '#4488cc',
                'fill-opacity': 0.08,
              }}
            />
            <Layer
              id={`maplos-line-${i}`}
              type="line"
              paint={{
                'line-color': item.isEnemy ? '#cc4444' : '#4488cc',
                'line-opacity': 0.25,
                'line-width': 1,
              }}
            />
          </Source>
        ))}

        {/* allRadarCoverage removed — RNG range rings handle this now */}

        {intelLOSPolygons.map((poly, i) => (
          <Source key={`intel-los-${i}`} id={`intel-los-${i}`} type="geojson" data={poly}>
            <Layer
              id={`intel-los-fill-${i}`}
              type="fill"
              paint={{
                'fill-color': '#ff8800',
                'fill-opacity': 0.06,
              }}
            />
            <Layer
              id={`intel-los-line-${i}`}
              type="line"
              paint={{
                'line-color': '#ff8800',
                'line-opacity': 0.3,
                'line-width': 1,
                'line-dasharray': [4, 4],
              }}
            />
          </Source>
        ))}

        {geoData && (
          <Source id="countries" type="geojson" data={geoData}>
            <Layer
              id="country-fill"
              type="fill"
              beforeId="overlay-anchor"
              paint={{
                'fill-color': ['match', ['get', 'iso_a3'],
                  'IRN', '#1a1520',
                  'USA', '#151a28',
                  '#111620',
                ] as unknown as string,
                'fill-opacity': mapMode === 'satellite' ? 0 : 1,
              }}
            />
            <Layer
              id="country-borders"
              type="line"
              beforeId="overlay-anchor"
              paint={{
                'line-color': ['match', ['get', 'iso_a3'],
                  'IRN', '#553333',
                  'USA', '#334455',
                  '#2d4a3e',
                ] as unknown as string,
                'line-width': ['match', ['get', 'iso_a3'],
                  'IRN', 1.5,
                  0.6,
                ] as unknown as number,
                'line-opacity': 0.9,
              }}
            />
            <Layer
              id="iran-glow"
              type="line"
              source="countries"
              beforeId="overlay-anchor"
              filter={['==', ['get', 'iso_a3'], 'IRN']}
              paint={{
                'line-color': '#cc4444',
                'line-width': 2,
                'line-opacity': 0.3,
                'line-blur': 3,
              }}
            />
            {/* Country name labels — placed at polygon centroids */}
            <Layer
              id="country-labels"
              type="symbol"
              layout={{
                'symbol-placement': 'point' as const,
                'text-field': ['get', 'name'],
                'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 6, 16, 8, 20] as unknown as number,
                'text-font': ['Noto Sans Regular'],
                'text-letter-spacing': 0.2,
                'text-max-width': 6,
                'text-transform': 'uppercase' as const,
                'text-allow-overlap': false,
              }}
              paint={{
                'text-color': 'rgba(180, 180, 170, 0.45)',
                'text-halo-color': 'rgba(10, 14, 20, 0.8)',
                'text-halo-width': 2,
              }}
            />
          </Source>
        )}

        {rngFilter !== 'off' && rangeRingData && (
            <Source id="range-rings" type="geojson" data={rangeRingData}>
              {/* Fill — very subtle for both types */}
              <Layer
                id="range-ring-fill"
                type="fill"
                paint={{
                  'fill-color': ['get', 'fill'],
                }}
              />
              {/* SAM rings: solid bright green line, 1.5px */}
              <Layer
                id="range-ring-stroke-sam"
                type="line"
                filter={['==', ['get', 'ringType'], 'sam']}
                paint={{
                  'line-color': ['get', 'stroke'],
                  'line-width': 1.5,
                }}
              />
              {/* Offensive rings: dashed nation color, thinner */}
              <Layer
                id="range-ring-stroke-missile"
                type="line"
                filter={['==', ['get', 'ringType'], 'missile']}
                paint={{
                  'line-color': ['get', 'stroke'],
                  'line-width': 1,
                  'line-dasharray': [6, 4],
                }}
              />
              {/* Labels: weapon name + range along the ring line */}
              <Layer
                id="range-ring-labels"
                type="symbol"
                minzoom={4}
                layout={{
                  'text-field': ['get', 'label'],
                  'text-size': 10,
                  'text-font': ['Noto Sans Regular'],
                  'symbol-placement': 'line',
                  'text-allow-overlap': false,
                  'symbol-spacing': 300,
                  'text-letter-spacing': 0.05,
                }}
                paint={{
                  'text-color': '#e0e0e0',
                  'text-halo-color': 'rgba(0, 0, 0, 1)',
                  'text-halo-width': 2,
                }}
              />
            </Source>
        )}
        {/* Range rings for selected unit(s) — always visible, brighter */}
        {selRingData && selRingData.features.length > 0 && (
            <Source id="selected-range-rings" type="geojson" data={selRingData}>
              <Layer
                id="sel-ring-fill"
                type="fill"
                paint={{
                  'fill-color': ['get', 'fill'],
                  'fill-opacity': 1,
                }}
              />
              <Layer
                id="sel-ring-stroke"
                type="line"
                paint={{
                  'line-color': ['get', 'stroke'],
                  'line-width': 2,
                  'line-opacity': 1,
                }}
              />
            </Source>
        )}
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
