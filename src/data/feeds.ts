/**
 * Central config for every REAL external data source the game uses.
 * All endpoints verified keyless + CORS-enabled 2026-06-10 (research sweep).
 * Every consumer MUST degrade gracefully on fetch failure — these are
 * community/agency services and they drift.
 *
 * Compliance: the game must stay free/non-revenue (Esri free-use, EOX CC-BY-NC-SA).
 * Attribution lives in the LIVE FEEDS window credits panel (INTEL_SOURCES below).
 */

/** Slippy-map tile coordinates from lat/lon (verified against Bandar Abbas fixtures) */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number } {
  const x = Math.floor(((lon + 180) / 360) * 2 ** z)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z)
  return { x, y }
}

/** Esri World Imagery — high-res IMINT backdrops + FMV scenery. NOTE: path is z/y/x. */
export function esriImageryTileUrl(z: number, x: number, y: number): string {
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
}

/** Yesterday UTC as YYYY-MM-DD — the safe GIBS/Worldview date (today may not be downlinked) */
export function safeGibsDate(now: Date = new Date()): string {
  const d = new Date(now.getTime() - 24 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

/**
 * NASA Worldview Snapshot — one keyless fetch returns a date-stamped recon JPEG
 * of any bbox. The IMINT product generator. 404 on a date = "pass not downlinked yet".
 */
export function worldviewSnapshotUrl(opts: {
  date: string
  south: number
  west: number
  north: number
  east: number
  width?: number
  height?: number
}): string {
  const { date, south, west, north, east, width = 768, height = 512 } = opts
  return (
    'https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot' +
    '&LAYERS=VIIRS_SNPP_CorrectedReflectance_TrueColor&CRS=EPSG:4326' +
    `&TIME=${date}&BBOX=${south},${west},${north},${east}` +
    `&WIDTH=${width}&HEIGHT=${height}&FORMAT=image/jpeg`
  )
}

/**
 * NASA GIBS WMTS — daily VIIRS true color as a maplibre raster source.
 * maxzoom 9. NEVER use TIME=default (resolves to tomorrow UTC → 404).
 */
export function gibsDailyTrueColorTiles(date: string): { tiles: string[]; maxzoom: number; attribution: string } {
  return {
    tiles: [
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    ],
    maxzoom: 9,
    attribution: 'NASA GIBS',
  }
}

/**
 * EUMETSAT EUMETView WMS — Meteosat-9 IODC, 15-minute cadence over the Gulf.
 * The one genuinely LIVE satellite source. ir108 works at night.
 */
export function eumetsatLiveUrl(opts: {
  layer: 'rgb_naturalenhncd' | 'ir108'
  south: number
  west: number
  north: number
  east: number
  width?: number
  height?: number
}): string {
  const { layer, south, west, north, east, width = 640, height = 480 } = opts
  return (
    'https://view.eumetsat.int/geoserver/wms?service=WMS&request=GetMap&version=1.3.0' +
    `&layers=msg_iodc:${layer}&styles=&format=image/jpeg&crs=EPSG:4326` +
    `&bbox=${south},${west},${north},${east}&width=${width}&height=${height}`
  )
}

/** airplanes.live — real live ADS-B over the Gulf. ~1 req/s limit: poll every 45 s, radius ≤ 250 nm. */
export function adsbLiveUrl(lat: number, lon: number, radiusNm: number): string {
  return `https://api.airplanes.live/v2/point/${lat.toFixed(3)}/${lon.toFixed(3)}/${Math.min(250, radiusNm)}`
}

export const ADSB_POLL_INTERVAL_MS = 45_000

/** Open-Meteo — real current cloud cover, gates optical satellite tasking */
export function cloudCoverUrl(lat: number, lon: number): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=cloud_cover`
}

/** Reuters "Vessel traffic in Strait of Hormuz" live stream (verified embeddable via oEmbed) */
export const HORMUZ_LIVE_YOUTUBE_ID = 'osUeQTR91Ig'

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1`
}

/** EUMETSAT live window default bbox — the Gulf theater */
export const GULF_BBOX = { south: 22, west: 44, north: 32, east: 62 }

/** Attribution for the LIVE FEEDS credits panel — required by source terms */
export const INTEL_SOURCES: { name: string; role: string }[] = [
  { name: 'Esri · Maxar · Earthstar Geographics', role: 'World Imagery basemap & IMINT products' },
  { name: 'NASA Global Imagery Browse Services (GIBS)', role: 'Daily VIIRS reconnaissance mosaics' },
  { name: 'EUMETSAT © 2026', role: 'Meteosat-9 IODC live geostationary imagery' },
  { name: 'airplanes.live', role: 'Live ADS-B air traffic' },
  { name: 'Open-Meteo', role: 'Real-time weather (collection gating)' },
  { name: 'Reuters', role: 'Strait of Hormuz live vessel traffic' },
  { name: 'Unit imagery: U.S. DoD (public domain) · Wikimedia Commons contributors (CC)', role: 'Recognition photos — no DoD endorsement implied' },
  { name: 'Mapterhorn · Mapzen/Tilezen · NASA SRTM', role: 'Terrain relief (hillshade DEM tiles)' },
]
