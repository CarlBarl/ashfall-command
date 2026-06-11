import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { useStrikeStore } from '@/store/strike-store'
import { useIntelStore } from '@/store/intel-store'
import { useMenuStore } from '@/store/menu-store'
import { sendCommand, getFullState, loadState } from '@/store/bridge'
import { saveToSlot, loadFromSlot } from '@/store/save-load'
import { useIsMobile } from '@/hooks/useIsMobile'
import ObjectivesPanel from './ObjectivesPanel'
import type { ROE } from '@/types/game'

type PanelKey = 'orbat' | 'stats' | 'economy'

const LEFT_PANELS: { key: PanelKey; label: string; shortLabel: string; storeKey: 'showOrbat' | 'showStats' | 'showEconomy' }[] = [
  { key: 'orbat', label: 'ORBAT', shortLabel: 'OB', storeKey: 'showOrbat' },
  { key: 'stats', label: 'SITREP', shortLabel: 'SIT', storeKey: 'showStats' },
  { key: 'economy', label: 'ECON', shortLabel: 'EC', storeKey: 'showEconomy' },
]

const ROE_OPTIONS: { value: ROE; label: string; shortLabel: string; color: string }[] = [
  { value: 'weapons_free', label: 'WEAPONS FREE', shortLabel: 'FREE', color: 'var(--status-ready)' },
  { value: 'weapons_tight', label: 'WEAPONS TIGHT', shortLabel: 'TIGHT', color: 'var(--status-engaged)' },
  { value: 'hold_fire', label: 'HOLD FIRE', shortLabel: 'HOLD', color: 'var(--status-damaged)' },
]

// Speed = ticks per 100ms, 1 tick = 1 game second → speed 360 = 1 game-hour per real second
const INLINE_SPEEDS = [0, 0.1, 6, 360] as const
const INLINE_LABELS: Record<number, string> = {
  0: '||',
  0.1: '1s',
  6: '1m',
  360: '1h',
}

// Time slider works in game-time multipliers (game-seconds per real second);
// engine speed (ticks per 100ms) = multiplier / 10
const SLIDER_MAX_MULT = 3600
const SLIDER_STEPS = 1000
const SNAP_PCT = 0.08
const DETENTS: { mult: number; label: string }[] = [
  { mult: 0, label: 'PAUSED' },
  { mult: 1, label: '1×' },
  { mult: 8, label: '8×' },
  { mult: 60, label: '60×' },
  { mult: 600, label: '10m/s' },
  { mult: 3600, label: '1h/s' },
]

function multToPos(mult: number): number {
  if (mult <= 0) return 0
  return Math.max(1, Math.min(SLIDER_STEPS, Math.round(1 + ((SLIDER_STEPS - 1) * Math.log(mult)) / Math.log(SLIDER_MAX_MULT))))
}

function posToMult(pos: number): number {
  if (pos <= 0) return 0
  const raw = Math.pow(SLIDER_MAX_MULT, (pos - 1) / (SLIDER_STEPS - 1))
  for (const d of DETENTS) {
    if (d.mult > 0 && Math.abs(raw - d.mult) <= d.mult * SNAP_PCT) return d.mult
  }
  return Math.round(raw)
}

function multLabel(mult: number): string {
  const detent = DETENTS.find((d) => Math.abs(d.mult - mult) < 0.001)
  if (detent) return detent.label
  return mult >= 1 ? `×${Math.round(mult)}` : `×${mult.toFixed(1)}`
}

const WAR_CONFIRM_MS = 5_000
const EXIT_CONFIRM_MS = 4_000

// Two-step confirm state with a wall-clock auto-disarm (UI-side only, never engine time)
function useArmedCountdown(durationMs: number) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null)
  const deadlineRef = useRef(0)
  const armed = remainingMs !== null

  useEffect(() => {
    if (!armed) return
    const id = setInterval(() => {
      const left = deadlineRef.current - Date.now()
      setRemainingMs(left > 0 ? left : null)
    }, 100)
    return () => clearInterval(id)
  }, [armed])

  const arm = useCallback(() => {
    deadlineRef.current = Date.now() + durationMs
    setRemainingMs(durationMs)
  }, [durationMs])
  const disarm = useCallback(() => setRemainingMs(null), [])

  return {
    armed,
    secondsLeft: remainingMs === null ? 0 : Math.ceil(remainingMs / 1000),
    arm,
    disarm,
  }
}

export default function TopBar() {
  const isMobile = useIsMobile()
  const rngFilter = useUIStore((s) => s.rngFilter)
  const toggleRangeRings = useCallback(() => {
    useUIStore.setState((s) => ({ rngFilter: s.rngFilter === 'off' ? 'both' : 'off' }))
  }, [])
  const showRangeRings = rngFilter !== 'off'
  const showOrbat = useUIStore((s) => s.showOrbat)
  const showStats = useUIStore((s) => s.showStats)
  const showEconomy = useUIStore((s) => s.showEconomy)
  const showIntel = useUIStore((s) => s.showIntel)
  const toggleIntel = useUIStore((s) => s.toggleIntel)
  const liveFeedsOpen = useUIStore((s) => s.liveFeedsOpen)
  const toggleLiveFeeds = useUIStore((s) => s.toggleLiveFeeds)
  const placingCatalogId = useIntelStore((s) => s.placingCatalogId)

  const units = useGameStore((s) => s.viewState.units)
  const nations = useGameStore((s) => s.viewState.nations)
  const time = useGameStore((s) => s.viewState.time)
  const playerNation = useGameStore((s) => s.viewState.playerNation)
  const shippingLanes = useGameStore((s) => s.viewState.shippingLanes)
  const warSupport = useGameStore((s) => s.viewState.warSupport)
  const objectives = useGameStore((s) => s.viewState.objectives)
  const eventLog = useGameStore((s) => s.eventLog)
  const hormuzLane = shippingLanes.find((l) => l.id === 'hormuz')

  const playerState = nations.find((n) => n.id === playerNation)
  const primaryEnemyNation = nations.find((n) => n.id !== playerNation) ?? null
  const atWarWithPrimaryEnemy = primaryEnemyNation
    ? (playerState?.atWar.includes(primaryEnemyNation.id) ?? false)
    : false
  const primaryEnemyLabel = primaryEnemyNation?.id.toUpperCase() ?? 'ENEMY'
  const hasUnits = units.length > 0

  const [showHelp, setShowHelp] = useState(false)
  const warConfirm = useArmedCountdown(WAR_CONFIRM_MS)
  const [offerClickPending, setOfferClickPending] = useState(false)
  const [roeOpen, setRoeOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [objectivesOpen, setObjectivesOpen] = useState(false)

  // Standing enemy ceasefire offer, derived from the persistent event log
  const enemyOffered = useMemo(() => {
    if (!primaryEnemyNation) return false
    for (let i = eventLog.length - 1; i >= 0; i--) {
      const e = eventLog[i]
      if (e.type === 'WAR_ENDED') return false
      if (e.type === 'CEASEFIRE_OFFERED' && e.by === primaryEnemyNation.id) return true
    }
    return false
  }, [eventLog, primaryEnemyNation])

  const panelStates: Record<PanelKey, boolean> = {
    orbat: showOrbat,
    stats: showStats,
    economy: showEconomy,
  }

  const handlePanelToggle = (key: PanelKey) => {
    useUIStore.getState().toggleLeftPanel(key)
  }

  // Determine the "dominant" theater ROE by checking what most player-controlled units have
  const playerUnits = units.filter((u) => u.nation === playerNation && u.status !== 'destroyed')
  const roeCounts: Record<ROE, number> = { weapons_free: 0, weapons_tight: 0, hold_fire: 0 }
  for (const u of playerUnits) {
    roeCounts[u.roe]++
  }
  const dominantRoe: ROE = (Object.entries(roeCounts) as [ROE, number][])
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'hold_fire'
  const dominantRoeOption = ROE_OPTIONS.find((o) => o.value === dominantRoe)

  const handleTheaterRoe = (roe: ROE) => {
    for (const u of playerUnits) {
      sendCommand({ type: 'SET_ROE', unitId: u.id, roe })
    }
    setRoeOpen(false)
  }

  const handleDeclareWar = () => {
    if (!primaryEnemyNation) return
    if (!warConfirm.armed) {
      warConfirm.arm()
      return
    }
    warConfirm.disarm()
    sendCommand({ type: 'DECLARE_WAR', target: primaryEnemyNation.id })
  }

  const handleOfferCeasefire = () => {
    if (!primaryEnemyNation) return
    if (!offerClickPending) {
      setOfferClickPending(true)
      return
    }
    sendCommand({ type: 'OFFER_CEASEFIRE', target: primaryEnemyNation.id })
    setOfferClickPending(false)
  }

  const gameDate = new Date(time.timestamp)
  const dateStr = gameDate.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    timeZone: 'UTC',
  })
  const timeStr = gameDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  })

  // ─── MOBILE LAYOUT ───────────────────────────────────────────
  // Clean command bar: date/time + speed presets + war status + ROE
  // Panel toggles are in MobileNav — not duplicated here.
  if (isMobile) {
    return (
      <>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 4,
            background: 'var(--bg-panel)',
            borderBottom: '1px solid var(--border-default)',
            padding: '5px 8px',
            paddingTop: 'max(5px, env(safe-area-inset-top, 5px))',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
          }}
        >
          {/* Left: date/time */}
          <span style={{
            color: 'var(--text-accent)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            fontSize: '0.7rem',
          }}>
            {dateStr} {timeStr}Z
          </span>

          {/* Center: speed presets */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {INLINE_SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => sendCommand({ type: 'SET_SPEED', speed: s })}
                style={{
                  background: time.speed === s ? 'var(--border-accent)' : 'var(--bg-hover)',
                  border: `1px solid ${time.speed === s ? 'var(--border-accent)' : 'var(--border-default)'}`,
                  borderRadius: 4,
                  color: time.speed === s ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  padding: '4px 7px',
                  fontWeight: 600,
                  minWidth: 28,
                }}
              >
                {INLINE_LABELS[s]}
              </button>
            ))}
          </div>

          {/* Right: ATK + war status + ROE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasUnits && <StrikeBtn compact />}

            {atWarWithPrimaryEnemy ? (
              <span style={{
                color: 'var(--status-damaged)',
                fontWeight: 700,
                fontSize: '0.6rem',
                whiteSpace: 'nowrap',
              }}>
                WAR
              </span>
            ) : !warConfirm.armed ? (
              <button
                onClick={handleDeclareWar}
                style={{
                  background: 'var(--iran-secondary)',
                  border: '1px solid var(--iran-primary)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.55rem',
                  padding: '3px 6px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                WAR
              </button>
            ) : (
              <button
                onClick={handleDeclareWar}
                onBlur={warConfirm.disarm}
                style={{
                  background: 'var(--status-damaged)',
                  border: '2px solid var(--status-damaged)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.55rem',
                  padding: '3px 6px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {`CONFIRM ${warConfirm.secondsLeft}`}
              </button>
            )}

            {hasUnits && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setRoeOpen(!roeOpen)}
                  style={{
                    background: 'var(--bg-hover)',
                    border: `1px solid ${dominantRoeOption?.color ?? 'var(--border-default)'}`,
                    borderRadius: 4,
                    color: dominantRoeOption?.color ?? 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.55rem',
                    padding: '3px 6px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {dominantRoeOption?.shortLabel ?? 'ROE'}
                </button>

                {roeOpen && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    background: 'var(--bg-panel)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--panel-radius)',
                    padding: 4,
                    zIndex: 30,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    minWidth: 110,
                  }}>
                    {ROE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => handleTheaterRoe(opt.value)}
                        style={{
                          background: dominantRoe === opt.value ? opt.color : 'var(--bg-hover)',
                          border: dominantRoe === opt.value
                            ? `1px solid ${opt.color}`
                            : '1px solid var(--border-default)',
                          borderRadius: 3,
                          color: dominantRoe === opt.value ? 'var(--bg-primary)' : 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--font-size-xs)',
                          padding: '6px 10px',
                          fontWeight: dominantRoe === opt.value ? 700 : 400,
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {opt.shortLabel}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Close dropdown on outside click */}
        {roeOpen && (
          <div
            onClick={() => setRoeOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 9 }}
          />
        )}
      </>
    )
  }

  // ─── DESKTOP LAYOUT ─────────────────────────────────────────
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'var(--bar-bg)',
          border: '1px solid var(--bar-border)',
          borderRadius: 'var(--panel-radius)',
          padding: '2px 4px',
          backdropFilter: 'blur(4px)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
        }}
      >
        {/* ClockZone: date/time + inline speed buttons + speed dropdown */}
        <span style={{
          color: 'var(--text-accent)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          padding: '0 2px',
        }}>
          {dateStr} {timeStr}Z
        </span>

        <Sep />

        <TimeSlider speed={time.speed} />

        <Sep />

        {/* Left panel radio group */}
        {LEFT_PANELS.map(({ key, label }) => (
          <ToggleBtn
            key={key}
            active={panelStates[key]}
            onClick={() => handlePanelToggle(key)}
            label={label}
          />
        ))}

        {hasUnits && (
          <>
            <Sep />
            {/* Strike planner shortcut */}
            <StrikeBtn compact={false} />
          </>
        )}

        <Sep />

        {/* Intel panel toggle */}
        <IntelBtn active={showIntel || !!placingCatalogId} onClick={toggleIntel} compact={false} />

        {/* Live feeds window toggle */}
        <LiveBtn active={liveFeedsOpen} onClick={toggleLiveFeeds} />

        <Sep />

        {/* Hormuz status badge */}
        {hormuzLane && hormuzLane.status !== 'open' && (
          <span style={{
            color: hormuzLane.status === 'blocked' ? 'var(--status-damaged)' : 'var(--status-engaged)',
            border: `1px solid ${hormuzLane.status === 'blocked' ? 'var(--status-damaged)' : 'var(--status-engaged)'}`,
            borderRadius: 3,
            padding: '2px 4px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>
            HORMUZ {hormuzLane.status === 'blocked' ? 'BLOCKED' : 'REDUCED'}
          </span>
        )}

        <Sep />

        {/* War status + ROE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {atWarWithPrimaryEnemy ? (
            <>
              <span style={{
                color: 'var(--status-damaged)',
                fontWeight: 700,
                fontSize: 'var(--font-size-xs)',
                whiteSpace: 'nowrap',
              }}>
                {`WAR: ${primaryEnemyLabel}`}
              </span>
              {primaryEnemyNation && (
                <WarSupportBars
                  player={{ tag: playerNation.toUpperCase(), support: warSupport[playerNation] ?? 100 }}
                  enemy={{ tag: primaryEnemyNation.id.toUpperCase(), support: warSupport[primaryEnemyNation.id] ?? 100 }}
                />
              )}
            </>
          ) : (
            <span style={{
              color: 'var(--status-ready)',
              fontWeight: 600,
              fontSize: 'var(--font-size-xs)',
              whiteSpace: 'nowrap',
            }}>
              PEACE
            </span>
          )}

          {/* Theater ROE dropdown */}
          {hasUnits && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setRoeOpen(!roeOpen)}
                style={{
                  background: 'var(--bg-hover)',
                  border: `1px solid ${dominantRoeOption?.color ?? 'var(--border-default)'}`,
                  borderRadius: 3,
                  color: dominantRoeOption?.color ?? 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-xs)',
                  padding: '2px 4px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {dominantRoeOption?.label ?? 'ROE'}
              </button>

              {roeOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 4,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--panel-radius)',
                  padding: 4,
                  zIndex: 30,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  minWidth: 140,
                }}>
                  {ROE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleTheaterRoe(opt.value)}
                      style={{
                        background: dominantRoe === opt.value ? opt.color : 'var(--bg-hover)',
                        border: dominantRoe === opt.value
                          ? `1px solid ${opt.color}`
                          : '1px solid var(--border-default)',
                        borderRadius: 3,
                        color: dominantRoe === opt.value ? 'var(--bg-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--font-size-xs)',
                        padding: '4px 8px',
                        fontWeight: dominantRoe === opt.value ? 700 : 400,
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Objectives chip (only at war) */}
          {atWarWithPrimaryEnemy && objectives.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setObjectivesOpen(!objectivesOpen)}
                style={{
                  background: objectivesOpen ? 'var(--bg-hover)' : 'none',
                  border: `1px solid ${objectivesOpen ? 'var(--border-accent)' : 'var(--border-default)'}`,
                  borderRadius: 3,
                  color: objectivesOpen ? 'var(--text-accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-xs)',
                  padding: '2px 4px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {'OBJECTIVES ▾'}
              </button>

              {objectivesOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--panel-radius)',
                  padding: 10,
                  zIndex: 30,
                  minWidth: 260,
                }}>
                  <ObjectivesPanel objectives={objectives} />
                </div>
              )}
            </div>
          )}

          {/* Ceasefire controls (only at war) */}
          {atWarWithPrimaryEnemy && primaryEnemyNation && (
            enemyOffered ? (
              <>
                <style>{'@keyframes cf-pulse{0%,100%{box-shadow:0 0 0 0 rgba(63,185,80,0.5)}50%{box-shadow:0 0 0 6px rgba(63,185,80,0)}}'}</style>
                <button
                  onClick={() => sendCommand({ type: 'CEASE_FIRE', target: primaryEnemyNation.id })}
                  title={`${primaryEnemyLabel} has offered a ceasefire`}
                  style={{
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--status-ready)',
                    borderRadius: 3,
                    color: 'var(--status-ready)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-size-xs)',
                    padding: '2px 4px',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    animation: 'cf-pulse 1.6s ease-in-out infinite',
                  }}
                >
                  ACCEPT CEASEFIRE
                </button>
              </>
            ) : (
              <button
                onClick={handleOfferCeasefire}
                onBlur={() => setOfferClickPending(false)}
                style={{
                  background: offerClickPending ? 'var(--border-accent)' : 'var(--bg-hover)',
                  border: offerClickPending
                    ? '2px solid var(--border-accent)'
                    : '1px solid var(--border-default)',
                  borderRadius: 3,
                  color: offerClickPending ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-xs)',
                  padding: '2px 4px',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {offerClickPending ? 'CONFIRM OFFER' : 'OFFER CEASEFIRE'}
              </button>
            )
          )}

          {/* Declare war button (only at peace) */}
          {!atWarWithPrimaryEnemy && primaryEnemyNation && (
            <button
              onClick={handleDeclareWar}
              onBlur={warConfirm.disarm}
              style={{
                background: warConfirm.armed ? 'var(--status-damaged)' : 'var(--iran-secondary)',
                border: warConfirm.armed
                  ? '2px solid var(--status-damaged)'
                  : '1px solid var(--iran-primary)',
                borderRadius: 3,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
                padding: '2px 4px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {warConfirm.armed ? `CONFIRM WAR ${warConfirm.secondsLeft}` : 'DECLARE WAR'}
            </button>
          )}
        </div>

        {/* Desktop overflow menu */}
        {(
          <>
            <Sep />
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setOverflowOpen(!overflowOpen)}
                style={{
                  background: overflowOpen ? 'var(--bg-hover)' : 'none',
                  border: `1px solid ${overflowOpen ? 'var(--border-accent)' : 'transparent'}`,
                  borderRadius: 3,
                  color: overflowOpen ? 'var(--text-accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-xs)',
                  padding: '2px 4px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  opacity: overflowOpen ? 1 : 0.55,
                }}
              >
                {'\u00B7\u00B7\u00B7'}
              </button>

              {overflowOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: 'var(--bg-panel)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--panel-radius)',
                  padding: 4,
                  zIndex: 30,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  minWidth: 120,
                }}>
                  {/* RINGS toggle */}
                  <OverflowItem
                    label="RINGS"
                    active={showRangeRings}
                    onClick={() => { toggleRangeRings(); setOverflowOpen(false) }}
                  />
                  {/* Help toggle */}
                  <OverflowItem
                    label="HELP (?)"
                    active={showHelp}
                    onClick={() => { setShowHelp(!showHelp); setOverflowOpen(false) }}
                  />
                  {/* Save/Load */}
                  <OverflowSaveLoad onDone={() => setOverflowOpen(false)} />
                  {/* Resign (only at war) */}
                  {atWarWithPrimaryEnemy && (
                    <OverflowResign onDone={() => setOverflowOpen(false)} />
                  )}
                  <OverflowMainMenu onDone={() => setOverflowOpen(false)} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Close dropdowns on outside click */}
      {(roeOpen || overflowOpen || objectivesOpen) && (
        <div
          onClick={() => { setRoeOpen(false); setOverflowOpen(false); setObjectivesOpen(false) }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9,
          }}
        />
      )}

      {/* Help overlay */}
      {showHelp && (
        <div style={{
          position: 'absolute',
          top: 48,
          left: 12,
          zIndex: 20,
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--panel-radius)',
          padding: 12,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
          minWidth: 220,
        }}>
          <div style={{ color: 'var(--text-accent)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>
            Controls
          </div>
          <div style={{ color: 'var(--text-accent)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
            Keyboard
          </div>
          <HelpRow keys="Space" desc="Pause / resume" />
          <HelpRow keys="1" desc="1 sec/s" />
          <HelpRow keys="2" desc="1 min/s" />
          <HelpRow keys="3" desc="10 min/s" />
          <HelpRow keys="4" desc="1 hr/s" />
          <HelpRow keys="5" desc="10 hr/s" />
          <HelpRow keys="O" desc="ORBAT panel" />
          <HelpRow keys="E" desc="Economy panel" />
          <HelpRow keys="I" desc="Intel panel" />
          <HelpRow keys="R" desc="Range rings" />
          <HelpRow keys="L" desc="Line of sight" />
          <HelpRow keys="V" desc="Elevation overlay" />
          <HelpRow keys="M" desc="Map style" />
          <HelpRow keys="Esc" desc="Deselect" />
          <div style={{ height: 6 }} />
          <div style={{ color: 'var(--text-accent)', fontWeight: 600, marginBottom: 4, marginTop: 4, textTransform: 'uppercase' }}>
            Mouse
          </div>
          <HelpRow keys="Click unit" desc="Select unit" />
          <HelpRow keys="Right-click map" desc="Move selected unit" />
          <HelpRow keys="Shift+right-click" desc="Queue waypoint" />
          <div style={{ height: 6 }} />
          <div style={{ color: 'var(--text-accent)', fontWeight: 600, marginBottom: 4, marginTop: 4, textTransform: 'uppercase' }}>
            Top Bar
          </div>
          <HelpRow keys="TIME SLIDER" desc="Any speed; snaps to 1×/8×/60×/10m/1h" />
          <HelpRow keys="LIVE" desc="Real-data live feeds window" />
          <HelpRow keys="ROE dropdown" desc="Theater-wide ROE" />
          <HelpRow keys="DECLARE WAR" desc="Initiate hostilities (click twice)" />
          <HelpRow keys="OFFER CEASEFIRE" desc="Propose ending the war (click twice)" />
          <HelpRow keys="OBJECTIVES" desc="War objectives progress" />
          <div style={{ height: 6 }} />
          <div style={{ color: 'var(--text-accent)', fontWeight: 600, marginBottom: 4, marginTop: 4, textTransform: 'uppercase' }}>
            Targeting
          </div>
          <HelpRow keys="SELECT ON MAP" desc="Enter targeting mode" />
          <HelpRow keys="Click enemy" desc="Set as target" />
          <HelpRow keys="+/- buttons" desc="Set salvo quantity" />
        </div>
      )}
    </>
  )
}

function ToggleBtn({
  active,
  onClick,
  label,
  compact = false,
}: {
  active: boolean
  onClick: () => void
  label: string
  compact?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--bg-hover)' : 'none',
        border: `1px solid ${active ? 'var(--border-accent)' : 'transparent'}`,
        borderRadius: 3,
        color: active ? 'var(--text-accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        padding: compact ? '2px 4px' : '2px 4px',
        textTransform: 'uppercase',
        fontWeight: 600,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        opacity: active ? 1 : 0.55,
      }}
    >
      {label}
    </button>
  )
}

function OverflowItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--bg-hover)' : 'var(--bg-hover)',
        border: active
          ? '1px solid var(--border-accent)'
          : '1px solid var(--border-default)',
        borderRadius: 3,
        color: active ? 'var(--text-accent)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        padding: '4px 8px',
        fontWeight: active ? 700 : 400,
        textAlign: 'left',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function WarSupportBars({
  player,
  enemy,
}: {
  player: { tag: string; support: number }
  enemy: { tag: string; support: number }
}) {
  return (
    <div title="War support" style={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center', padding: '0 2px' }}>
      <SupportBar tag={player.tag} support={player.support} color="var(--text-accent)" />
      <SupportBar tag={enemy.tag} support={enemy.support} color="var(--status-damaged)" />
    </div>
  )
}

function SupportBar({ tag, support, color }: { tag: string; support: number; color: string }) {
  const pct = Math.round(Math.max(0, Math.min(100, support)))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, lineHeight: 1 }}>
      <span style={{ fontSize: '0.5rem', color: 'var(--text-muted)', fontWeight: 600, width: 26, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {tag}
      </span>
      <div style={{ width: 44, height: 4, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s ease' }} />
      </div>
      <span style={{ fontSize: '0.5rem', color, fontWeight: 700, width: 20, whiteSpace: 'nowrap' }}>
        {pct}%
      </span>
    </div>
  )
}

function OverflowResign({ onDone }: { onDone: () => void }) {
  const [pending, setPending] = useState(false)
  return (
    <button
      onClick={() => {
        if (!pending) {
          setPending(true)
          return
        }
        sendCommand({ type: 'RESIGN' })
        setPending(false)
        onDone()
      }}
      onBlur={() => setPending(false)}
      style={{
        background: pending ? 'var(--status-damaged)' : 'var(--bg-hover)',
        border: pending
          ? '1px solid var(--status-damaged)'
          : '1px solid var(--border-default)',
        borderRadius: 3,
        color: pending ? 'var(--bg-primary)' : 'var(--status-damaged)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        padding: '4px 8px',
        fontWeight: pending ? 700 : 400,
        textAlign: 'left',
        whiteSpace: 'nowrap',
      }}
    >
      {pending ? 'CONFIRM RESIGN' : 'RESIGN'}
    </button>
  )
}

// Same return-to-menu flow as DebriefScreen's MAIN MENU button
function exitToMainMenu() {
  useStrikeStore.getState().reset()
  useIntelStore.getState().reset()
  const ui = useUIStore.getState()
  ui.clearSelection()
  ui.setLeftPanel(null)
  useUIStore.setState({ showIntel: false })
  useMenuStore.getState().setScreen('start')
}

function OverflowMainMenu({ onDone }: { onDone: () => void }) {
  const confirm = useArmedCountdown(EXIT_CONFIRM_MS)
  return (
    <button
      onClick={() => {
        if (!confirm.armed) {
          confirm.arm()
          return
        }
        confirm.disarm()
        onDone()
        exitToMainMenu()
      }}
      style={{
        background: confirm.armed ? 'var(--status-engaged)' : 'var(--bg-hover)',
        border: confirm.armed
          ? '1px solid var(--status-engaged)'
          : '1px solid var(--border-default)',
        borderRadius: 3,
        color: confirm.armed ? 'var(--bg-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        padding: '4px 8px',
        fontWeight: confirm.armed ? 700 : 400,
        textAlign: 'left',
        whiteSpace: 'nowrap',
      }}
    >
      {confirm.armed ? 'CONFIRM EXIT?' : 'MAIN MENU'}
    </button>
  )
}

function OverflowSaveLoad({ onDone }: { onDone: () => void }) {
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleSave = async () => {
    try {
      const json = await getFullState()
      await saveToSlot('quicksave', json)
      setFeedback('Saved!')
      setTimeout(() => { setFeedback(null); onDone() }, 1200)
    } catch {
      setFeedback('Error!')
      setTimeout(() => setFeedback(null), 2000)
    }
  }

  const handleLoad = async () => {
    try {
      const json = await loadFromSlot('quicksave')
      if (!json) { setFeedback('No save'); setTimeout(() => setFeedback(null), 2000); return }
      await loadState(json)
      setFeedback('Loaded!')
      setTimeout(() => { setFeedback(null); onDone() }, 1200)
    } catch {
      setFeedback('Error!')
      setTimeout(() => setFeedback(null), 2000)
    }
  }

  if (feedback) {
    return (
      <div style={{
        color: 'var(--status-ready)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 600,
        padding: '4px 8px',
        textAlign: 'center',
      }}>
        {feedback}
      </div>
    )
  }

  return (
    <>
      <OverflowItem label="SAVE" active={false} onClick={handleSave} />
      <OverflowItem label="LOAD" active={false} onClick={handleLoad} />
    </>
  )
}

function IntelBtn({ active, onClick, compact }: { active: boolean; onClick: () => void; compact: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--bg-hover)' : 'none',
        border: `1px solid ${active ? 'var(--border-accent)' : 'transparent'}`,
        borderRadius: 3,
        color: active ? 'var(--text-accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        padding: compact ? '2px 4px' : '2px 4px',
        textTransform: 'uppercase',
        fontWeight: 600,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        opacity: active ? 1 : 0.55,
      }}
    >
      {compact ? 'INT' : 'INTEL'}
    </button>
  )
}

function TimeSlider({ speed }: { speed: number }) {
  const [dragMult, setDragMult] = useState<number | null>(null)
  const lastSentRef = useRef(0)
  const pendingRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastNonzeroRef = useRef(0.1)

  useEffect(() => {
    if (speed > 0) lastNonzeroRef.current = speed
  }, [speed])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  // ~10 sends/s max while dragging; trailing send keeps the final position
  const sendSpeed = useCallback((s: number) => {
    const since = performance.now() - lastSentRef.current
    if (since >= 100) {
      lastSentRef.current = performance.now()
      sendCommand({ type: 'SET_SPEED', speed: s })
    } else {
      pendingRef.current = s
      if (!timerRef.current) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null
          lastSentRef.current = performance.now()
          if (pendingRef.current !== null) {
            sendCommand({ type: 'SET_SPEED', speed: pendingRef.current })
            pendingRef.current = null
          }
        }, 100 - since)
      }
    }
  }, [])

  const mult = dragMult ?? speed * 10
  const paused = mult <= 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 2px' }}>
      <button
        onClick={() => sendCommand({ type: 'SET_SPEED', speed: speed === 0 ? lastNonzeroRef.current : 0 })}
        title={paused ? 'Resume' : 'Pause'}
        aria-label={paused ? 'Resume' : 'Pause'}
        style={{
          background: paused ? 'var(--bg-hover)' : 'none',
          border: `1px solid ${paused ? 'var(--status-engaged)' : 'transparent'}`,
          borderRadius: 3,
          color: paused ? 'var(--status-engaged)' : 'var(--text-secondary)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
          padding: '2px 5px',
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        {paused ? '▶' : '||'}
      </button>
      <input
        type="range"
        min={0}
        max={SLIDER_STEPS}
        step={1}
        value={multToPos(mult)}
        aria-label="Game speed"
        title="Game speed (snaps to 1× / 8× / 60× / 10m/s / 1h/s)"
        onChange={(e) => {
          const m = posToMult(Number(e.target.value))
          setDragMult(m)
          sendSpeed(m / 10)
        }}
        onPointerUp={() => setDragMult(null)}
        onKeyUp={() => setDragMult(null)}
        onBlur={() => setDragMult(null)}
        style={{ width: 92, height: 4, cursor: 'pointer', accentColor: 'var(--text-accent)' }}
      />
      <span style={{
        fontSize: 'var(--font-size-xs)',
        color: paused ? 'var(--status-engaged)' : 'var(--text-secondary)',
        minWidth: 46,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}>
        {multLabel(mult)}
      </span>
    </div>
  )
}

function LiveBtn({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--bg-hover)' : 'none',
        border: `1px solid ${active ? 'var(--border-accent)' : 'transparent'}`,
        borderRadius: 3,
        color: active ? 'var(--text-accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        padding: '2px 4px',
        textTransform: 'uppercase',
        fontWeight: 600,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        opacity: active ? 1 : 0.55,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {active && (
        <>
          <style>{'@keyframes live-pulse{0%,100%{opacity:1}50%{opacity:0.25}}'}</style>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#e84545', animation: 'live-pulse 1.4s ease-in-out infinite', flexShrink: 0 }} />
        </>
      )}
      LIVE
    </button>
  )
}

function StrikeBtn({ compact }: { compact: boolean }) {
  const { open, openStrike, closeStrike } = useStrikeStore()
  return (
    <button
      onClick={() => open ? closeStrike() : openStrike('plan')}
      style={{
        background: open ? 'var(--iran-secondary)' : 'none',
        border: `1px solid ${open ? 'var(--iran-primary)' : 'transparent'}`,
        borderRadius: 3,
        color: open ? '#fff' : 'var(--iran-primary)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        padding: compact ? '2px 4px' : '2px 4px',
        textTransform: 'uppercase',
        fontWeight: 700,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
      }}
    >
      {compact ? 'ATK' : 'STRIKE'}
    </button>
  )
}

function Sep() {
  return <div style={{ width: 1, height: 14, background: 'var(--border-default)', flexShrink: 0 }} />
}

function HelpRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', gap: 12 }}>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{keys}</span>
      <span>{desc}</span>
    </div>
  )
}
