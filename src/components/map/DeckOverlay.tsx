import { useEffect, useMemo, useState } from 'react'
import { useControl, useMap } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { MapboxOverlayProps } from '@deck.gl/mapbox'
import { createIntelMapLayers } from './layers/IntelLayers'
import { createEffectsLayers, KILL_ANIM_MS } from './layers/EffectsLayers'
import { createAirMapLayers } from './layers/AirLayers'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import { useMapIntelStore } from '@/store/map-intel-store'

const CALLSIGN_MIN_ZOOM = 6.5

export default function DeckOverlay(props: MapboxOverlayProps) {
  const units = useGameStore((s) => s.viewState.units)
  const tick = useGameStore((s) => s.viewState.time.tick)
  const playerNation = useGameStore((s) => s.viewState.playerNation)
  const intel = useGameStore((s) => s.viewState.intel)
  const airMissions = useGameStore((s) => s.viewState.airMissions)
  const eventLog = useGameStore((s) => s.eventLog)
  const selectedUnitId = useUIStore((s) => s.selectedUnitId)
  const intelOverlays = useMapIntelStore((s) => s.intelOverlays)
  const adsbLive = useMapIntelStore((s) => s.adsbLive)
  const adsbAircraft = useMapIntelStore((s) => s.adsbAircraft)
  const staleSince = useMapIntelStore((s) => s.staleSince)
  const syncStaleContacts = useMapIntelStore((s) => s.syncStaleContacts)
  const killMarkers = useMapIntelStore((s) => s.killMarkers)
  const trackHistory = useMapIntelStore((s) => s.trackHistory)
  const ingestKillEvents = useMapIntelStore((s) => s.ingestKillEvents)
  const sampleTrackHistory = useMapIntelStore((s) => s.sampleTrackHistory)

  useEffect(() => {
    syncStaleContacts(units, tick, playerNation)
  }, [units, tick, playerNation, syncStaleContacts])

  useEffect(() => {
    ingestKillEvents(eventLog, units)
  }, [eventLog, units, ingestKillEvents])

  useEffect(() => {
    sampleTrackHistory(units, tick, playerNation)
  }, [units, tick, playerNation, sampleTrackHistory])

  // Real-time clock for the kill animations — runs only while a marker is in its
  // ~10 s window, so an idle map costs nothing
  const [effectsNowMs, setEffectsNowMs] = useState(() => performance.now())
  useEffect(() => {
    if (killMarkers.length === 0) return
    const newestMs = killMarkers[killMarkers.length - 1].addedAtMs
    if (performance.now() - newestMs >= KILL_ANIM_MS) return
    let raf = 0
    let lastSet = 0
    const loop = (t: number) => {
      if (t - lastSet >= 33) {
        lastSet = t
        setEffectsNowMs(performance.now())
      }
      if (performance.now() - newestMs < KILL_ANIM_MS) {
        raf = requestAnimationFrame(loop)
      } else {
        setEffectsNowMs(performance.now()) // settle on the fully-faded end state
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [killMarkers])

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

  const effectsLayers = useMemo(
    () => createEffectsLayers({ killMarkers, trackHistory, units, playerNation, nowMs: effectsNowMs }),
    [killMarkers, trackHistory, units, playerNation, effectsNowMs],
  )

  const airLayers = useMemo(
    () => createAirMapLayers({ missions: airMissions ?? [], units, selectedUnitId }),
    [airMissions, units, selectedUnitId],
  )

  // Intel layers prepend (draw beneath) the game layers passed by GameMap;
  // effects and air-war glyphs sit between — above rings/overlays, below unit icons
  const mergedProps = useMemo<MapboxOverlayProps>(
    () => ({ ...props, layers: [...intelLayers, ...effectsLayers, ...airLayers, ...(props.layers ?? [])] }),
    [props, intelLayers, effectsLayers, airLayers],
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
