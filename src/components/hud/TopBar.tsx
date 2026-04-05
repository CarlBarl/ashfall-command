import { useState, useCallback } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { useStrikeStore } from '@/store/strike-store'
import { useIntelStore } from '@/store/intel-store'
import { sendCommand, getFullState, loadState } from '@/store/bridge'
import { saveToSlot, loadFromSlot } from '@/store/save-load'
import { useIsMobile } from '@/hooks/useIsMobile'
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

const INLINE_SPEEDS = [0, 0.1, 6, 600] as const
const INLINE_LABELS: Record<number, string> = {
  0: '||',
  0.1: '1s',
  6: '1m',
  600: '1h',
}

const ALL_SPEEDS = [0, 0.1, 1, 6, 60, 600, 3600] as const
const ALL_SPEED_LABELS: Record<number, string> = {
  0: '||',
  0.1: '1s/s',
  1: '10s/s',
  6: '1m/s',
  60: '10m/s',
  600: '1hr/s',
  3600: '10h/s',
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
  const placingCatalogId = useIntelStore((s) => s.placingCatalogId)

  const units = useGameStore((s) => s.viewState.units)
  const nations = useGameStore((s) => s.viewState.nations)
  const time = useGameStore((s) => s.viewState.time)
  const playerNation = useGameStore((s) => s.viewState.playerNation)

  const playerState = nations.find((n) => n.id === playerNation)
  const primaryEnemyNation = nations.find((n) => n.id !== playerNation) ?? null
  const atWarWithPrimaryEnemy = primaryEnemyNation
    ? (playerState?.atWar.includes(primaryEnemyNation.id) ?? false)
    : false
  const primaryEnemyLabel = primaryEnemyNation?.name.split(' ').at(-1)?.toUpperCase() ?? 'ENEMY'

  const [showHelp, setShowHelp] = useState(false)
  const [warClickPending, setWarClickPending] = useState(false)
  const [roeOpen, setRoeOpen] = useState(false)
  const [speedDropdownOpen, setSpeedDropdownOpen] = useState(false)
  const [overflowOpen, setOverflowOpen] = useState(false)

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
    if (!warClickPending) {
      setWarClickPending(true)
      return
    }
    sendCommand({ type: 'DECLARE_WAR', target: primaryEnemyNation.id })
    setWarClickPending(false)
  }

  // Format game date+time (reused from TimeControls)
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

  return (
    <>
      <div
        className={isMobile ? 'mobile-topbar' : undefined}
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? 2 : 4,
          background: 'var(--bar-bg)',
          border: '1px solid var(--bar-border)',
          borderRadius: 'var(--panel-radius)',
          padding: isMobile ? '2px 4px' : '2px 4px',
          backdropFilter: 'blur(4px)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
        }}
      >
        {/* ClockZone: date/time + inline speed buttons + speed dropdown */}
        {!isMobile && (
          <>
            <span style={{
              color: 'var(--text-accent)',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              padding: '0 2px',
            }}>
              {dateStr} {timeStr}Z
            </span>

            <Sep />

            {INLINE_SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => sendCommand({ type: 'SET_SPEED', speed: s })}
                style={{
                  background: time.speed === s ? 'var(--border-accent)' : 'none',
                  border: `1px solid ${time.speed === s ? 'var(--border-accent)' : 'transparent'}`,
                  borderRadius: 3,
                  color: time.speed === s ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-xs)',
                  padding: '2px 4px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  opacity: time.speed === s ? 1 : 0.55,
                }}
              >
                {INLINE_LABELS[s]}
              </button>
            ))}

            {/* Speed chevron dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setSpeedDropdownOpen(!speedDropdownOpen)}
                style={{
                  background: 'none',
                  border: '1px solid transparent',
                  borderRadius: 3,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-xs)',
                  padding: '2px 3px',
                  fontWeight: 600,
                  opacity: 0.55,
                }}
              >
                {'\u203A'}
              </button>

              {speedDropdownOpen && (
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
                  minWidth: 80,
                }}>

                  {/* Fine speed slider */}
                  <div style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={time.speed <= 0 ? 0 : Math.round(1 + 99 * Math.log(time.speed / 0.1) / Math.log(36000))}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        const speed = val === 0 ? 0 : 0.1 * Math.pow(36000, (val - 1) / 99)
                        sendCommand({ type: 'SET_SPEED', speed })
                      }}
                      style={{ flex: 1, height: 4, cursor: 'pointer', accentColor: 'var(--text-accent)' }}
                    />
                    <span style={{ fontSize: '0.55rem', color: 'var(--text-secondary)', minWidth: 35, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {time.speed <= 0 ? '||' : time.speed < 6 ? `${Math.round(time.speed * 10)}s/s` : time.speed < 300 ? `${Math.round(time.speed / 6)}m/s` : `${(time.speed / 360).toFixed(1)}h/s`}
                    </span>
                  </div>
                  <div style={{ height: 1, background: 'var(--border-default)', margin: '2px 0' }} />

                  {ALL_SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        sendCommand({ type: 'SET_SPEED', speed: s })
                        setSpeedDropdownOpen(false)
                      }}
                      style={{
                        background: time.speed === s ? 'var(--border-accent)' : 'var(--bg-hover)',
                        border: time.speed === s
                          ? '1px solid var(--border-accent)'
                          : '1px solid var(--border-default)',
                        borderRadius: 3,
                        color: time.speed === s ? 'var(--text-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--font-size-xs)',
                        padding: '4px 8px',
                        fontWeight: time.speed === s ? 700 : 400,
                        textAlign: 'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ALL_SPEED_LABELS[s]}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Sep />
          </>
        )}

        {/* Left panel radio group */}
        {LEFT_PANELS.map(({ key, label, shortLabel }) => (
          <ToggleBtn
            key={key}
            active={panelStates[key]}
            onClick={() => handlePanelToggle(key)}
            label={isMobile ? shortLabel : label}
            compact={isMobile}
          />
        ))}

        <Sep />

        {/* Strike planner shortcut */}
        <StrikeBtn compact={isMobile} />

        <Sep />

        {/* Intel panel toggle */}
        <IntelBtn active={showIntel || !!placingCatalogId} onClick={toggleIntel} compact={isMobile} />

        <Sep />

        {/* War status + ROE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 2 : 4 }}>
          {atWarWithPrimaryEnemy ? (
            <span style={{
              color: 'var(--status-damaged)',
              fontWeight: 700,
              fontSize: 'var(--font-size-xs)',
              whiteSpace: 'nowrap',
            }}>
              {isMobile ? 'WAR' : `WAR: ${primaryEnemyLabel}`}
            </span>
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
                padding: isMobile ? '2px 4px' : '2px 4px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {isMobile
                ? (dominantRoeOption?.shortLabel ?? 'ROE')
                : (dominantRoeOption?.label ?? 'ROE')}
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
                minWidth: isMobile ? 100 : 140,
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
                    {isMobile ? opt.shortLabel : opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Declare war button (only at peace) */}
          {!atWarWithPrimaryEnemy && primaryEnemyNation && (
            <button
              onClick={handleDeclareWar}
              onBlur={() => setWarClickPending(false)}
              style={{
                background: warClickPending ? 'var(--status-damaged)' : 'var(--iran-secondary)',
                border: warClickPending
                  ? '2px solid var(--status-damaged)'
                  : '1px solid var(--iran-primary)',
                borderRadius: 3,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
                padding: isMobile ? '2px 4px' : '2px 4px',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {warClickPending
                ? (isMobile ? 'CONFIRM' : 'CONFIRM WAR')
                : (isMobile ? 'WAR' : 'DECLARE WAR')}
            </button>
          )}
        </div>

        {/* On mobile, keep inline buttons; on desktop, move to overflow */}
        {isMobile && (
          <>
            <Sep />
            <ToggleBtn active={showRangeRings} onClick={toggleRangeRings} label="RINGS" compact />
            <Sep />
            <ToggleBtn active={showHelp} onClick={() => setShowHelp(!showHelp)} label="?" compact />
            <Sep />
            <SaveLoadButtons compact />
          </>
        )}

        {/* Desktop overflow menu */}
        {!isMobile && (
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
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Close dropdowns on outside click */}
      {(roeOpen || speedDropdownOpen || overflowOpen) && (
        <div
          onClick={() => { setRoeOpen(false); setSpeedDropdownOpen(false); setOverflowOpen(false) }}
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
          <HelpRow keys="Click unit" desc="Select unit" />
          <HelpRow keys="Right-click map" desc="Move selected unit" />
          <HelpRow keys="Launch Panel" desc="Select target + fire" />
          <div style={{ height: 6 }} />
          <div style={{ color: 'var(--text-accent)', fontWeight: 600, marginBottom: 4, marginTop: 4, textTransform: 'uppercase' }}>
            Panels
          </div>
          <HelpRow keys="RINGS" desc="Toggle range ring overlay" />
          <HelpRow keys="ORBAT" desc="Order of battle tree" />
          <HelpRow keys="SITREP" desc="Situation report / ammo" />
          <HelpRow keys="ECON" desc="Economy comparison" />
          <div style={{ height: 6 }} />
          <div style={{ color: 'var(--text-accent)', fontWeight: 600, marginBottom: 4, marginTop: 4, textTransform: 'uppercase' }}>
            Top Bar
          </div>
          <HelpRow keys="ROE dropdown" desc="Theater-wide ROE for all US forces" />
          <HelpRow keys="DECLARE WAR" desc="Initiate hostilities (click twice)" />
          <div style={{ height: 6 }} />
          <div style={{ color: 'var(--text-accent)', fontWeight: 600, marginBottom: 4, marginTop: 4, textTransform: 'uppercase' }}>
            Targeting
          </div>
          <HelpRow keys="SELECT ON MAP" desc="Enter targeting mode" />
          <HelpRow keys="Click enemy" desc="Set as target" />
          <HelpRow keys="+/- buttons" desc="Set salvo quantity" />
          <HelpRow keys="Quick Salvo" desc="Fire 5/10/20 at once" />
          <div style={{ height: 8 }} />
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
            All panels are draggable (grab title bar) and minimizable (- button).
          </div>
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

function SaveLoadButtons({ compact }: { compact: boolean }) {
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleSave = async () => {
    try {
      const json = await getFullState()
      await saveToSlot('quicksave', json)
      setFeedback('Saved!')
      setTimeout(() => setFeedback(null), 2000)
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
      setTimeout(() => setFeedback(null), 2000)
    } catch {
      setFeedback('Error!')
      setTimeout(() => setFeedback(null), 2000)
    }
  }

  if (feedback) {
    return <span style={{ color: 'var(--status-ready)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>{feedback}</span>
  }

  return (
    <>
      <ToggleBtn active={false} onClick={handleSave} label={compact ? 'SAV' : 'SAVE'} compact={compact} />
      <ToggleBtn active={false} onClick={handleLoad} label={compact ? 'LD' : 'LOAD'} compact={compact} />
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
