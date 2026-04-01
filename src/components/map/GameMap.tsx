import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapGL, { Layer, Source } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent } from 'react-map-gl/maplibre'
import type { StyleSpecification } from 'maplibre-gl'
import DeckOverlay from './DeckOverlay'
import ContextMenu from './ContextMenu'
import { createUnitLayer, getLastClusterMap } from './layers/UnitLayer'
import ClusterPopup from './ClusterPopup'
import type { UnitCluster } from './layers/cluster'
import { createMissileLayers } from './layers/MissileLayer'
import { createImpactLayer } from './layers/ImpactLayer'
import { createRangeRingGeoJSON } from './layers/RangeRingLayer'
import InfoTooltip from './InfoTooltip'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { useStrikeStore } from '@/store/strike-store'
import baseStyle from '@/styles/map-style.json'

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
}

export default function GameMap() {
  const mapRef = useRef<MapRef>(null)
  const [geoData, setGeoData] = useState<GeoJSON.FeatureCollection | null>(null)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const hoverPosRef = useRef({ x: 0, y: 0 })
  const [clusterPopup, setClusterPopup] = useState<{ cluster: UnitCluster; x: number; y: number } | null>(null)

  const selectedUnitId = useUIStore((s) => s.selectedUnitId)
  const hoveredUnitId = useUIStore((s) => s.hoveredUnitId)
  const selectUnit = useUIStore((s) => s.selectUnit)
  const hoverUnit = useUIStore((s) => s.hoverUnit)
  const showRangeRings = useUIStore((s) => s.showRangeRings)

  // Targeting state from strike-store (not ui-store compat shims)
  const targetUnitId = useStrikeStore((s) => s.targetUnitId)
  const targetingMode = useStrikeStore((s) => s.targetingMode)
  const setTarget = useStrikeStore((s) => s.setTargetUnitId)

  // Get selected unit's nation for targeting
  const units = useGameStore((s) => s.viewState.units)
  const selectedUnit = units.find(u => u.id === selectedUnitId)
  const selectedNation = selectedUnit?.nation ?? null
  const missiles = useGameStore((s) => s.viewState.missiles)
  const allEvents = useGameStore((s) => s.viewState.events)
  const currentTime = useGameStore((s) => s.visualTimestamp)
  const currentTick = useGameStore((s) => s.viewState.time.tick)

  useEffect(() => {
    fetch('/geo/ne_50m_admin_0.geojson')
      .then(r => r.json())
      .then(setGeoData)
  }, [])

  const onLoad = useCallback(() => {
    mapRef.current?.getMap()?.resize()
  }, [])

  const onContextMenu = useCallback((e: MapLayerMouseEvent) => {
    e.preventDefault()
    if (selectedUnitId) {
      setCtxMenu({ x: e.point.x, y: e.point.y, lngLat: e.lngLat })
    }
  }, [selectedUnitId])

  const onMapClick = useCallback(() => {
    setCtxMenu(null)
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

    // Check if clicked unit is an enemy — set as target instead of selecting
    const clickedUnit = units.find(u => u.id === id)
    if (clickedUnit && clickedUnit.nation !== 'usa') {
      setTarget(id)
      return
    }
    selectUnit(id)
  }, [selectUnit, setTarget, units])

  const layers = useMemo(() => [
    ...createUnitLayer(units, selectedUnitId, hoveredUnitId, targetUnitId, targetingMode, handleHover, handleUnitClick, setTarget, selectedNation),
    ...createMissileLayers(missiles, currentTime, handleHover),
    createImpactLayer(allEvents, units, currentTick),
  ], [units, selectedUnitId, hoveredUnitId, targetUnitId, targetingMode, handleHover, handleUnitClick, setTarget, selectedNation, missiles, currentTime, allEvents, currentTick])

  return (
    <>
      <MapGL
        ref={mapRef}
        initialViewState={INITIAL_VIEW}
        style={{ width: '100%', height: '100%' }}
        mapStyle={baseStyle as StyleSpecification}
        onLoad={onLoad}
        onContextMenu={onContextMenu}
        onClick={onMapClick}
        attributionControl={false}
        maxZoom={12}
        minZoom={2}
        cursor={targetingMode ? 'crosshair' : hoveredUnitId ? 'pointer' : 'grab'}
      >
        <DeckOverlay layers={layers} />

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
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  )
}
