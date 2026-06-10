import { create } from 'zustand'
import type { ViewUnit } from '@/types/view'
import { ADSB_POLL_INTERVAL_MS, adsbLiveUrl } from '@/data/feeds'

export interface AdsbAircraft {
  id: string
  callsign: string
  lat: number
  lon: number
  /** Ground track degrees true; null when the feed omits it */
  track: number | null
}

const ADSB_CENTER = { lat: 26.5, lon: 54.0, radiusNm: 220 }
const ADSB_MAX_AIRCRAFT = 80

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

  toggleIntelOverlays: () => void
  toggleReconMosaic: () => void
  setAdsbLive: (on: boolean) => void
  toggleAdsbLive: () => void
  syncStaleContacts: (units: ViewUnit[], tick: number, playerNation: string) => void
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
}))
