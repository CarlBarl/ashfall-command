import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import {
  ADSB_POLL_INTERVAL_MS,
  GULF_BBOX,
  HORMUZ_LIVE_YOUTUBE_ID,
  INTEL_SOURCES,
  adsbLiveUrl,
  esriImageryTileUrl,
  eumetsatLiveUrl,
  youtubeEmbedUrl,
} from '@/data/feeds'
import { formatDtg, isGulfDaylight, tileGrid, NOISE_BG, SCANLINE_OVERLAY } from './imagery'

const GEOSAT_REFRESH_MS = 15 * 60 * 1000
const ADSB_CENTER = { lat: 26.5, lon: 54.0, radiusNm: 220 }

export default function LiveFeeds() {
  const open = useUIStore((s) => s.liveFeedsOpen)
  const toggleLiveFeeds = useUIStore((s) => s.toggleLiveFeeds)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null)

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const panel = panelRef.current
    if (!panel) return
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    const rect = panel.getBoundingClientRect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top }
  }, [])
  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    setPos({
      x: dragRef.current.origLeft + e.clientX - dragRef.current.startX,
      y: dragRef.current.origTop + e.clientY - dragRef.current.startY,
    })
  }, [])
  const onPointerUp = useCallback(() => { dragRef.current = null }, [])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        ...(pos ? { left: pos.x, top: pos.y } : { top: 48, right: 12 }),
        zIndex: 25,
        width: 'min(640px, 94vw)',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        fontFamily: 'var(--font-mono)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}
    >
      <style>{'@keyframes lf-rec{0%,100%{opacity:1}50%{opacity:0.25}} @keyframes lf-drift{0%{transform:scale(1.35) translate(-2.5%,-1.5%)}100%{transform:scale(1.35) translate(2.5%,1.8%)}}'}</style>

      {/* Title bar */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '5px 10px',
          borderBottom: '1px solid var(--border-default)',
          cursor: 'grab',
          userSelect: 'none',
        }}
      >
        <span style={{ color: 'var(--text-accent)', fontSize: 'var(--font-size-xs)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          LIVE FEEDS — THEATER ISR
        </span>
        <button
          onClick={toggleLiveFeeds}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)', padding: '0 3px', lineHeight: 1 }}
        >
          x
        </button>
      </div>

      {/* 2x2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 6 }}>
        <GeosatCell />
        <HormuzCamCell />
        <FmvCell />
        <AdsbCell />
      </div>

      {/* Credits — required by source terms */}
      <div style={{ borderTop: '1px solid var(--border-default)', padding: '4px 10px 6px' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.5rem', letterSpacing: '0.12em', marginBottom: 2 }}>
          INTEL SOURCES
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px 10px' }}>
          {INTEL_SOURCES.map((s) => (
            <span key={s.name} style={{ color: 'var(--text-muted)', fontSize: '0.5rem', opacity: 0.8 }}>
              {s.name} · {s.role}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function FeedCell({ title, live = true, caption, children }: { title: string; live?: boolean; caption?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 3, overflow: 'hidden', background: '#05070a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', borderBottom: '1px solid var(--border-default)' }}>
        {live && (
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e84545', animation: 'lf-rec 1.4s ease-in-out infinite', flexShrink: 0 }} />
        )}
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </span>
      </div>
      <div style={{ position: 'relative', aspectRatio: '16 / 10' }}>{children}</div>
      {caption !== undefined && (
        <div style={{ padding: '2px 6px', color: 'var(--text-muted)', fontSize: '0.5rem', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {caption}
        </div>
      )}
    </div>
  )
}

function OfflineCard({ label }: { label: string }) {
  return (
    <div style={{ ...NOISE_BG, position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.55rem', letterSpacing: '0.15em', fontWeight: 600 }}>{label}</span>
    </div>
  )
}

// ── 1. EUMETSAT Meteosat-9 IODC, genuinely live, 15-min cadence ─────────────

function GeosatCell() {
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now())
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const iv = setInterval(() => {
      setFailed(false)
      setRefreshedAt(Date.now())
    }, GEOSAT_REFRESH_MS)
    return () => clearInterval(iv)
  }, [])

  const layer = isGulfDaylight(refreshedAt) ? 'rgb_naturalenhncd' : 'ir108'
  const src = `${eumetsatLiveUrl({ layer, ...GULF_BBOX, width: 640, height: 360 })}&_cb=${refreshedAt}`
  const iso = new Date(refreshedAt).toISOString()

  return (
    <FeedCell title="GEOSAT IODC LIVE" caption={`MSG-9 IODC ${layer === 'ir108' ? 'IR 10.8µm' : 'NAT COLOR'} · ${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`}>
      {failed ? (
        <OfflineCard label="SIGNAL LOST" />
      ) : (
        <img
          src={src}
          alt=""
          onError={() => setFailed(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          draggable={false}
        />
      )}
    </FeedCell>
  )
}

// ── 2. Reuters Hormuz vessel-traffic live stream ────────────────────────────

function HormuzCamCell() {
  return (
    <FeedCell title="HORMUZ TRAFFIC CAM" caption="LIVE — courtesy Reuters">
      <iframe
        src={youtubeEmbedUrl(HORMUZ_LIVE_YOUTUBE_ID)}
        title="Strait of Hormuz live"
        allow="autoplay; encrypted-media"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
      />
    </FeedCell>
  )
}

// ── 3. Synthetic drone soda-straw over a tracked contact ────────────────────

function FmvCell() {
  const units = useGameStore((s) => s.viewState.units)
  const playerNation = useGameStore((s) => s.viewState.playerNation)
  const gameTimestamp = useGameStore((s) => s.viewState.time.timestamp)
  const tick = useGameStore((s) => s.viewState.time.tick)
  const fmvTargetId = useUIStore((s) => s.fmvTargetId)
  const setFmvTarget = useUIStore((s) => s.setFmvTarget)
  const [failedTiles, setFailedTiles] = useState<Record<string, boolean>>({})

  const contacts = units.filter(
    (u) => u.nation !== playerNation
      && u.status !== 'destroyed'
      && (u.visibility === 'tracked' || u.visibility === 'identified'),
  )
  const target = contacts.find((u) => u.id === fmvTargetId) ?? null
  const night = !isGulfDaylight(gameTimestamp)

  const select = (
    <select
      value={target?.id ?? ''}
      onChange={(e) => setFmvTarget(e.target.value === '' ? null : e.target.value)}
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 2,
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.5rem',
        maxWidth: '100%',
        padding: '1px 2px',
      }}
    >
      <option value="">— SELECT TARGET —</option>
      {contacts.map((u) => (
        <option key={u.id} value={u.id}>{u.name}</option>
      ))}
    </select>
  )

  if (!target) {
    return (
      <FeedCell title="ISR FMV" caption={select}>
        <OfflineCard label="NO DOWNLINK — SELECT TARGET" />
      </FeedCell>
    )
  }

  const { xs, ys } = tileGrid(target.position.lng, target.position.lat, 15, 2, 2)

  return (
    <FeedCell title={`ISR FMV — ${target.name}`} caption={select}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          animation: 'lf-drift 38s linear infinite alternate',
          filter: night ? 'invert(1) grayscale(1) contrast(1.4)' : 'saturate(0.8) contrast(1.05)',
        }}>
          {ys.map((ty) =>
            xs.map((tx) => {
              const k = `${tx}/${ty}`
              return failedTiles[k] ? (
                <div key={k} style={{ ...NOISE_BG, width: '100%', height: '100%' }} />
              ) : (
                <img
                  key={k}
                  src={esriImageryTileUrl(15, tx, ty)}
                  alt=""
                  onError={() => setFailedTiles((f) => ({ ...f, [k]: true }))}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  draggable={false}
                />
              )
            }),
          )}
        </div>

        {/* Crosshair */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 1, height: 30, background: 'rgba(255,255,255,0.7)', transform: 'translate(-50%, -50%)' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 30, height: 1, background: 'rgba(255,255,255,0.7)', transform: 'translate(-50%, -50%)' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 44, height: 44, border: '1px solid rgba(255,255,255,0.3)', transform: 'translate(-50%, -50%)' }} />
        </div>

        {/* Telemetry burn-ins */}
        <Burn style={{ top: 4, left: 5 }}>
          {`${Math.abs(target.position.lat).toFixed(4)}${target.position.lat >= 0 ? 'N' : 'S'} ${Math.abs(target.position.lng).toFixed(4)}${target.position.lng >= 0 ? 'E' : 'W'}`}
        </Burn>
        <Burn style={{ top: 4, right: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#e84545', animation: 'lf-rec 1.4s ease-in-out infinite' }} />
          REC
        </Burn>
        <Burn style={{ bottom: 4, left: 5 }}>ALT 18500FT · SLANT 12.4KM{night ? ' · IR' : ' · EO'}</Burn>
        <Burn style={{ bottom: 4, right: 5 }}>{formatDtg(tick)}</Burn>

        <div style={SCANLINE_OVERLAY} />
      </div>
    </FeedCell>
  )
}

function Burn({ style, children }: { style: CSSProperties; children: ReactNode }) {
  return (
    <div style={{ position: 'absolute', color: '#e6e6e6', fontSize: '0.5rem', letterSpacing: '0.08em', textShadow: '0 0 3px #000', pointerEvents: 'none', ...style }}>
      {children}
    </div>
  )
}

// ── 4. airplanes.live — real ADS-B over the Gulf ────────────────────────────

interface AdsbTrack {
  callsign: string
  alt: string
  gs: string
}

function AdsbCell() {
  const [tracks, setTracks] = useState<AdsbTrack[] | null>(null)
  const [total, setTotal] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch(adsbLiveUrl(ADSB_CENTER.lat, ADSB_CENTER.lon, ADSB_CENTER.radiusNm))
        if (!res.ok) throw new Error(`adsb ${res.status}`)
        const data = await res.json() as { ac?: Record<string, unknown>[] }
        if (!alive) return
        const ac = Array.isArray(data.ac) ? data.ac : []
        const withDist = ac
          .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number')
          .map((a) => ({
            a,
            d: ((a.lat as number) - ADSB_CENTER.lat) ** 2 + ((a.lon as number) - ADSB_CENTER.lon) ** 2,
          }))
          .sort((x, y) => x.d - y.d)
          .slice(0, 10)
        setTotal(ac.length)
        setTracks(withDist.map(({ a }) => ({
          callsign: (typeof a.flight === 'string' && a.flight.trim()) || (typeof a.hex === 'string' ? a.hex.toUpperCase() : '—'),
          alt: a.alt_baro === 'ground' ? 'GND' : typeof a.alt_baro === 'number' ? `${a.alt_baro}` : '—',
          gs: typeof a.gs === 'number' ? `${Math.round(a.gs)}` : '—',
        })))
        setFailed(false)
      } catch {
        if (alive) setFailed(true)
      }
    }
    poll()
    const iv = setInterval(poll, ADSB_POLL_INTERVAL_MS)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  return (
    <FeedCell
      title="ADS-B LIVE"
      caption={failed ? 'FEED OFFLINE' : `${total} REAL TRACKS — LIVE ADS-B`}
    >
      {failed ? (
        <OfflineCard label="FEED OFFLINE" />
      ) : tracks === null ? (
        <OfflineCard label="ACQUIRING…" />
      ) : (
        <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: '3px 6px', fontSize: '0.5rem', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 48px', gap: 2, color: 'var(--text-muted)', letterSpacing: '0.1em', marginBottom: 1 }}>
            <span>CALLSIGN</span><span style={{ textAlign: 'right' }}>ALT FT</span><span style={{ textAlign: 'right' }}>GS KT</span>
          </div>
          {tracks.length === 0 && (
            <div style={{ color: 'var(--text-muted)', padding: '8px 0', textAlign: 'center' }}>NO TRAFFIC IN BOX</div>
          )}
          {tracks.map((t, i) => (
            <div key={`${t.callsign}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 48px', gap: 2, padding: '0.5px 0' }}>
              <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.callsign}</span>
              <span style={{ textAlign: 'right' }}>{t.alt}</span>
              <span style={{ textAlign: 'right' }}>{t.gs}</span>
            </div>
          ))}
        </div>
      )}
    </FeedCell>
  )
}
