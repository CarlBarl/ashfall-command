import { useEffect, useMemo, useState } from 'react'
import { useControl, useMap } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { MapboxOverlayProps } from '@deck.gl/mapbox'
import { createIntelMapLayers } from './layers/IntelLayers'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import { useMapIntelStore } from '@/store/map-intel-store'

const CALLSIGN_MIN_ZOOM = 6.5

export default function DeckOverlay(props: MapboxOverlayProps) {
  const units = useGameStore((s) => s.viewState.units)
  const tick = useGameStore((s) => s.viewState.time.tick)
  const playerNation = useGameStore((s) => s.viewState.playerNation)
  const intel = useGameStore((s) => s.viewState.intel)
  const selectedUnitId = useUIStore((s) => s.selectedUnitId)
  const intelOverlays = useMapIntelStore((s) => s.intelOverlays)
  const adsbLive = useMapIntelStore((s) => s.adsbLive)
  const adsbAircraft = useMapIntelStore((s) => s.adsbAircraft)
  const staleSince = useMapIntelStore((s) => s.staleSince)
  const syncStaleContacts = useMapIntelStore((s) => s.syncStaleContacts)

  useEffect(() => {
    syncStaleContacts(units, tick, playerNation)
  }, [units, tick, playerNation, syncStaleContacts])

  // Quantized zoom read (boolean) so map panning doesn't churn re-renders
  const { current: mapRef } = useMap()
  const [showCallsigns, setShowCallsigns] = useState(false)
  useEffect(() => {
    const map = mapRef?.getMap()
    if (!map) return
    const onMove = () => setShowCallsigns(map.getZoom() > CALLSIGN_MIN_ZOOM)
    onMove()
    map.on('move', onMove)
    return () => { map.off('move', onMove) }
  }, [mapRef])

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId && u.nation === playerNation),
    [units, selectedUnitId, playerNation],
  )

  const intelLayers = useMemo(
    () => createIntelMapLayers({
      intelOverlaysOn: intelOverlays,
      adsbOn: adsbLive,
      units,
      playerNation,
      tick,
      staleSince,
      selectedUnit,
      taskings: intel?.taskings ?? [],
      aircraft: adsbAircraft,
      showCallsigns,
    }),
    [intelOverlays, adsbLive, units, playerNation, tick, staleSince, selectedUnit, intel, adsbAircraft, showCallsigns],
  )

  // Intel layers prepend (draw beneath) the game layers passed by GameMap
  const mergedProps = useMemo<MapboxOverlayProps>(
    () => ({ ...props, layers: [...intelLayers, ...(props.layers ?? [])] }),
    [props, intelLayers],
  )

  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({
      ...mergedProps,
      interleaved: false, // overlay mode — reliable picking
    }),
  )
  overlay.setProps(mergedProps)

  // The overlay canvas's first frame can composite as opaque black, hiding the
  // basemap; any later redraw clears correctly. The game starts paused, so without
  // this burst nothing would trigger that redraw and the black frame would stick.
  useEffect(() => {
    let frames = 0
    let raf = requestAnimationFrame(function kick() {
      const deck = (overlay as unknown as { _deck?: { redraw?: (reason?: string) => void } })._deck
      deck?.redraw?.('post-mount-clear')
      if (++frames < 60) raf = requestAnimationFrame(kick)
    })
    return () => cancelAnimationFrame(raf)
  }, [overlay])

  return null
}
