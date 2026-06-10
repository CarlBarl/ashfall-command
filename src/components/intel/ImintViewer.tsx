import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import { esriImageryTileUrl } from '@/data/feeds'
import { formatDtg, tileGrid, NOISE_BG, SCANLINE_OVERLAY } from './imagery'
import type { GameEvent, IntelProduct } from '@/types/game'

const TOAST_MS = 10_000

export default function ImintViewer() {
  const viewedProductId = useUIStore((s) => s.viewedProductId)
  const setViewedProduct = useUIStore((s) => s.setViewedProduct)
  const intel = useGameStore((s) => s.viewState.intel)
  const events = useGameStore((s) => s.viewState.events)
  const products = intel?.products ?? []

  // Toast on fresh imagery — event batches are one-shot, guard by reference
  const [toastUntil, setToastUntil] = useState(0)
  const toastBatchRef = useRef<GameEvent[] | null>(null)
  useEffect(() => {
    if (events.length === 0 || toastBatchRef.current === events) return
    toastBatchRef.current = events
    if (events.some((e) => e.type === 'SATELLITE_PASS_COMPLETE')) {
      setToastUntil(Date.now() + TOAST_MS)
    }
  }, [events])
  useEffect(() => {
    if (toastUntil <= Date.now()) return
    const t = setTimeout(() => setToastUntil(0), toastUntil - Date.now())
    return () => clearTimeout(t)
  }, [toastUntil])

  const product = viewedProductId
    ? products.find((p) => p.id === viewedProductId && p.kind === 'imint') ?? null
    : null

  // Esc closes the viewer; capture+stop so App's global Escape doesn't also fire
  useEffect(() => {
    if (!product) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setViewedProduct(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [product, setViewedProduct])

  const openNewest = () => {
    const newest = [...products].filter((p) => p.kind === 'imint').sort((a, b) => b.tick - a.tick)[0]
    if (newest) setViewedProduct(newest.id)
    setToastUntil(0)
  }

  const sensorName = product?.assetId
    ? intel?.assets.find((a) => a.id === product.assetId)?.name ?? product.assetId.toUpperCase()
    : 'UNKNOWN SENSOR'

  return (
    <>
      {toastUntil > Date.now() && !product && (
        <button
          onClick={openNewest}
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-accent)',
            borderRadius: 'var(--panel-radius)',
            color: 'var(--text-accent)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            letterSpacing: '0.06em',
            padding: '6px 14px',
            whiteSpace: 'nowrap',
          }}
        >
          NEW IMINT PRODUCT — VIEW
        </button>
      )}

      {product && (
        <div
          onClick={() => setViewedProduct(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <ProductFrame
            key={product.id}
            product={product}
            sensorName={sensorName}
            onClose={() => setViewedProduct(null)}
          />
        </div>
      )}
    </>
  )
}

function ProductFrame({ product, sensorName, onClose }: { product: IntelProduct; sensorName: string; onClose: () => void }) {
  const topSecret = product.classification.toUpperCase().includes('TOP SECRET')
  const zoom = product.assetId === 'commercial' ? 14 : 15
  const target = product.target ?? { lng: 56.27, lat: 27.18 }
  const { xs, ys } = tileGrid(target.lng, target.lat, zoom, 3, 2)
  const [failed, setFailed] = useState<Record<string, boolean>>({})

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        background: '#000',
        border: '1px solid #2a2f36',
        width: 'min(780px, 94vw)',
        boxShadow: '0 0 60px rgba(0,0,0,0.9)',
      }}
    >
      <ClassificationBanner text={product.classification} topSecret={topSecret} />

      {/* Image area */}
      <div style={{ position: 'relative', margin: '6px 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, background: '#05070a' }}>
          {ys.map((ty) =>
            xs.map((tx) => {
              const k = `${tx}/${ty}`
              return failed[k] ? (
                <div
                  key={k}
                  style={{
                    ...NOISE_BG,
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.5rem',
                    letterSpacing: '0.08em',
                    textAlign: 'center',
                    padding: 6,
                  }}
                >
                  COLLECTION ARTIFACT — IMAGE DATA UNAVAILABLE
                </div>
              ) : (
                <img
                  key={k}
                  src={esriImageryTileUrl(zoom, tx, ty)}
                  alt=""
                  onError={() => setFailed((f) => ({ ...f, [k]: true }))}
                  style={{ width: '100%', aspectRatio: '1', display: 'block', objectFit: 'cover' }}
                  draggable={false}
                />
              )
            }),
          )}
        </div>

        {/* Crosshair */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 1, height: 46, background: 'rgba(255,255,255,0.65)', transform: 'translate(-50%, -50%)' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 46, height: 1, background: 'rgba(255,255,255,0.65)', transform: 'translate(-50%, -50%)' }} />
          <div style={{ position: 'absolute', left: '50%', top: '50%', width: 70, height: 70, border: '1px solid rgba(255,255,255,0.35)', borderRadius: '50%', transform: 'translate(-50%, -50%)' }} />
        </div>

        {/* Corner brackets */}
        {([
          { left: 6, top: 6, borderLeft: '2px solid', borderTop: '2px solid' },
          { right: 6, top: 6, borderRight: '2px solid', borderTop: '2px solid' },
          { left: 6, bottom: 6, borderLeft: '2px solid', borderBottom: '2px solid' },
          { right: 6, bottom: 6, borderRight: '2px solid', borderBottom: '2px solid' },
        ] as const).map((pos, i) => (
          <div key={i} style={{ position: 'absolute', width: 22, height: 22, color: 'rgba(255,255,255,0.5)', pointerEvents: 'none', ...pos }} />
        ))}

        {/* Burn-ins */}
        <div style={{ position: 'absolute', top: 8, left: 34, color: '#e6e6e6', fontSize: '0.6rem', letterSpacing: '0.1em', textShadow: '0 0 3px #000' }}>
          {sensorName.toUpperCase()}
        </div>
        <div style={{ position: 'absolute', top: 8, right: 34, display: 'flex', gap: 6, alignItems: 'center' }}>
          {product.niirs !== undefined && (
            <span style={{ border: '1px solid rgba(255,255,255,0.5)', color: '#e6e6e6', fontSize: '0.55rem', padding: '1px 5px', letterSpacing: '0.08em', textShadow: '0 0 3px #000' }}>
              NIIRS {product.niirs}
            </span>
          )}
        </div>
        <div style={{ position: 'absolute', bottom: 8, left: 34, color: '#e6e6e6', fontSize: '0.6rem', letterSpacing: '0.1em', textShadow: '0 0 3px #000' }}>
          {formatDtg(product.tick)}
        </div>
        <div style={{ position: 'absolute', bottom: 8, right: 34, color: '#e6e6e6', fontSize: '0.6rem', letterSpacing: '0.1em', textShadow: '0 0 3px #000' }}>
          {`${Math.abs(target.lat).toFixed(4)}${target.lat >= 0 ? 'N' : 'S'} ${Math.abs(target.lng).toFixed(4)}${target.lng >= 0 ? 'E' : 'W'}`}
        </div>

        <div style={SCANLINE_OVERLAY} />
      </div>

      {/* Caption bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '4px 10px 8px',
        color: 'var(--text-secondary)',
        fontSize: 'var(--font-size-xs)',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.caption}</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid var(--border-default)',
            borderRadius: 3,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            padding: '2px 8px',
            flexShrink: 0,
          }}
        >
          CLOSE [ESC]
        </button>
      </div>

      <ClassificationBanner text={product.classification} topSecret={topSecret} />
    </div>
  )
}

function ClassificationBanner({ text, topSecret }: { text: string; topSecret: boolean }) {
  return (
    <div style={{
      background: topSecret ? '#8c1f1f' : '#1f6e2e',
      color: '#fff',
      textAlign: 'center',
      fontSize: '0.6rem',
      fontWeight: 700,
      letterSpacing: '0.25em',
      padding: '3px 0',
      textTransform: 'uppercase',
    }}>
      {text}
    </div>
  )
}
