import { create } from 'zustand'
import type { ViewUnit } from '@/types/view'
import type { GameEvent } from '@/types/game'
import { ADSB_POLL_INTERVAL_MS, adsbLiveUrl } from '@/data/feeds'

export interface AdsbAircraft {
  id: string
  callsign: string
  lat: number
  lon: number
  /** Ground track degrees true; null when the feed omits it */
  track: number | null
}

export interface KillMarker {
  id: string
  /** [lng, lat] */
  position: [number, number]
  tick: number
  /** UI wall clock at append — drives the ~10 s real-time death animation */
  addedAtMs: number
}

export interface TrackPoint {
  /** [lng, lat] */
  position: [number, number]
  tick: number
}

const ADSB_CENTER = { lat: 26.5, lon: 54.0, radiusNm: 220 }
const ADSB_MAX_AIRCRAFT = 80

const KILL_MARKER_CAP = 60
/** 1 tick = 1 game-second → one trail point every ~30 game-seconds */
const TRACK_SAMPLE_INTERVAL_TICKS = 30
const TRACK_BUFFER_SIZE = 24

interface MapIntelState {
  /** One switch for AOU rings + tasking swaths + sensor rings */
  intelOverlays: boolean
  /** GIBS daily VIIRS raster base layer */
  reconMosaic: boolean
  /** Live ADS-B aircraft layer (airplanes.live polling) */
  adsbLive: boolean
  adsbAircraft: AdsbAircraft[]
  /** Enemy contact id → tick when stale first became true (AOU growth anchor) */
  staleSince: Record<string, number>
  /** Destruction sites, oldest first, capped at KILL_MARKER_CAP */
  killMarkers: KillMarker[]
  /** Unit ids whose UNIT_DESTROYED has been processed (markers can be evicted, this can't) */
  killSeenIds: Record<string, true>
  /** Enemy contact id → recent positions, oldest first */
  trackHistory: Record<string, TrackPoint[]>

  toggleIntelOverlays: () => void
  toggleReconMosaic: () => void
  setAdsbLive: (on: boolean) => void
  toggleAdsbLive: () => void
  syncStaleContacts: (units: ViewUnit[], tick: number, playerNation: string) => void
  ingestKillEvents: (eventLog: GameEvent[], units: ViewUnit[], nowMs?: number) => void
  sampleTrackHistory: (units: ViewUnit[], tick: number, playerNation: string) => void
}

let adsbTimer: ReturnType<typeof setInterval> | null = null

async function pollAdsb(): Promise<void> {
  try {
    const res = await fetch(adsbLiveUrl(ADSB_CENTER.lat, ADSB_CENTER.lon, ADSB_CENTER.radiusNm))
    if (!res.ok) return
    const body = (await res.json()) as { ac?: unknown[] } | null
    const list = Array.isArray(body?.ac) ? body.ac : []
    const aircraft: AdsbAircraft[] = []
    for (const raw of list) {
      const ac = raw as { hex?: unknown; flight?: unknown; lat?: unknown; lon?: unknown; track?: unknown; lastPosition?: { lat?: unknown; lon?: unknown } }
      const lat = typeof ac.lat === 'number' ? ac.lat : ac.lastPosition?.lat
      const lon = typeof ac.lon === 'number' ? ac.lon : ac.lastPosition?.lon
      if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) continue
      aircraft.push({
        id: typeof ac.hex === 'string' ? ac.hex : `${lat.toFixed(4)},${lon.toFixed(4)}`,
        callsign: typeof ac.flight === 'string' ? ac.flight.trim() : '',
        lat,
        lon,
        track: typeof ac.track === 'number' && Number.isFinite(ac.track) ? ac.track : null,
      })
      if (aircraft.length >= ADSB_MAX_AIRCRAFT) break
    }
    if (useMapIntelStore.getState().adsbLive) {
      useMapIntelStore.setState({ adsbAircraft: aircraft })
    }
  } catch {
    // ambient flavor layer — a dead external feed must never break the game
  }
}

export const useMapIntelStore = create<MapIntelState>((set, get) => ({
  intelOverlays: false,
  reconMosaic: false,
  adsbLive: false,
  adsbAircraft: [],
  staleSince: {},
  killMarkers: [],
  killSeenIds: {},
  trackHistory: {},

  toggleIntelOverlays: () => set((s) => ({ intelOverlays: !s.intelOverlays })),
  toggleReconMosaic: () => set((s) => ({ reconMosaic: !s.reconMosaic })),

  setAdsbLive: (on) => {
    if (get().adsbLive === on) return
    if (adsbTimer !== null) {
      clearInterval(adsbTimer)
      adsbTimer = null
    }
    if (on) {
      set({ adsbLive: true })
      void pollAdsb()
      adsbTimer = setInterval(() => { void pollAdsb() }, ADSB_POLL_INTERVAL_MS)
    } else {
      set({ adsbLive: false, adsbAircraft: [] })
    }
  },

  toggleAdsbLive: () => get().setAdsbLive(!get().adsbLive),

  syncStaleContacts: (units, tick, playerNation) => {
    const prev = get().staleSince
    const next: Record<string, number> = {}
    let added = false
    for (const u of units) {
      if (u.nation === playerNation || !u.stale || u.status === 'destroyed') continue
      const since = prev[u.id]
      if (since === undefined) added = true
      next[u.id] = since ?? tick
    }
    // No additions and same key count → identical map, skip the set
    if (!added && Object.keys(prev).length === Object.keys(next).length) return
    set({ staleSince: next })
  },

  ingestKillEvents: (eventLog, units, nowMs = performance.now()) => {
    const { killMarkers, killSeenIds, trackHistory } = get()
    if (eventLog.length === 0) {
      // eventLog only goes back to empty on new game/load — drop the previous run's markers
      if (killMarkers.length > 0 || Object.keys(killSeenIds).length > 0) {
        set({ killMarkers: [], killSeenIds: {} })
      }
      return
    }
    let seen: Record<string, true> | null = null
    let added: KillMarker[] | null = null
    for (const e of eventLog) {
      if (e.type !== 'UNIT_DESTROYED') continue
      if (killSeenIds[e.unitId] || seen?.[e.unitId]) continue
      seen = seen ?? { ...killSeenIds }
      seen[e.unitId] = true
      const unit = units.find((u) => u.id === e.unitId)
      const trail = trackHistory[e.unitId]
      const position: [number, number] | undefined = unit
        ? [unit.position.lng, unit.position.lat]
        : trail && trail.length > 0
          ? trail[trail.length - 1].position
          : undefined
      if (!position) continue // contact never had a known fix — nothing to mark
      added = added ?? []
      added.push({ id: e.unitId, position, tick: e.tick, addedAtMs: nowMs })
    }
    if (seen === null) return
    set({
      killMarkers: added ? [...killMarkers, ...added].slice(-KILL_MARKER_CAP) : killMarkers,
      killSeenIds: seen,
    })
  },

  sampleTrackHistory: (units, tick, playerNation) => {
    const prev = get().trackHistory
    const next: Record<string, TrackPoint[]> = {}
    let changed = false
    for (const u of units) {
      if (u.nation === playerNation || u.status === 'destroyed') continue
      const buf = prev[u.id]
      const live = (u.visibility === 'tracked' || u.visibility === 'identified') && !u.stale
      if (!live) {
        // Degraded contact still in the snapshot: keep history, don't sample a frozen fix
        if (buf) next[u.id] = buf
        continue
      }
      const point: TrackPoint = { position: [u.position.lng, u.position.lat], tick }
      if (buf === undefined || buf.length === 0 || tick < buf[buf.length - 1].tick) {
        // tick behind the buffer = store reused across a new run
        next[u.id] = [point]
        changed = true
      } else if (tick - buf[buf.length - 1].tick >= TRACK_SAMPLE_INTERVAL_TICKS) {
        next[u.id] = [...buf, point].slice(-TRACK_BUFFER_SIZE)
        changed = true
      } else {
        next[u.id] = buf
      }
    }
    // Units gone from the snapshot drop out by not being copied over
    if (!changed && Object.keys(prev).length === Object.keys(next).length) return
    set({ trackHistory: next })
  },
}))
