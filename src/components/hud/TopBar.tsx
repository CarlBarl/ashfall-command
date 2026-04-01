import { useState } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { useStrikeStore } from '@/store/strike-store'
import { sendCommand } from '@/store/bridge'
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

export default function TopBar() {
  const isMobile = useIsMobile()
  const showRangeRings = useUIStore((s) => s.showRangeRings)
  const toggleRangeRings = useUIStore((s) => s.toggleRangeRings)
  const showOrbat = useUIStore((s) => s.showOrbat)
  const showStats = useUIStore((s) => s.showStats)
  const showEconomy = useUIStore((s) => s.showEconomy)
  // togglePanel replaced by handlePanelToggle using toggleLeftPanel

  const units = useGameStore((s) => s.viewState.units)
  const nations = useGameStore((s) => s.viewState.nations)

  const usaNation = nations.find((n) => n.id === 'usa')
  const atWarWithIran = usaNation?.atWar.includes('iran') ?? false

  const [showHelp, setShowHelp] = useState(false)
  const [warClickPending, setWarClickPending] = useState(false)
  const [roeOpen, setRoeOpen] = useState(false)

  const panelStates: Record<PanelKey, boolean> = {
    orbat: showOrbat,
    stats: showStats,
    economy: showEconomy,
  }

  // Radio-group toggle: close others, toggle clicked
  const handlePanelToggle = (key: PanelKey) => {
    useUIStore.getState().toggleLeftPanel(key)
  }

  // Determine the "dominant" theater ROE by checking what most USA units have
  const usaUnits = units.filter((u) => u.nation === 'usa' && u.status !== 'destroyed')
  const roeCounts: Record<ROE, number> = { weapons_free: 0, weapons_tight: 0, hold_fire: 0 }
  for (const u of usaUnits) {
    roeCounts[u.roe]++
  }
  const dominantRoe: ROE = (Object.entries(roeCounts) as [ROE, number][])
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'hold_fire'
  const dominantRoeOption = ROE_OPTIONS.find((o) => o.value === dominantRoe)

  const handleTheaterRoe = (roe: ROE) => {
    for (const u of usaUnits) {
      sendCommand({ type: 'SET_ROE', unitId: u.id, roe })
    }
    setRoeOpen(false)
  }

  const handleDeclareWar = () => {
    if (!warClickPending) {
      setWarClickPending(true)
      return
    }
    sendCommand({ type: 'DECLARE_WAR', target: 'iran' })
    setWarClickPending(false)
  }

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
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--panel-radius)',
          padding: isMobile ? '3px 4px' : '4px 6px',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
        }}
      >
        {/* Map overlays */}
        <ToggleBtn
          active={showRangeRings}
          onClick={toggleRangeRings}
          label="RINGS"
          compact={isMobile}
        />

        <Sep />

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

        {/* War status + ROE */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 2 : 4 }}>
          {atWarWithIran ? (
            <span style={{
              color: 'var(--status-damaged)',
              fontWeight: 700,
              fontSize: 'var(--font-size-xs)',
              whiteSpace: 'nowrap',
            }}>
              {isMobile ? 'WAR' : 'WAR: IRAN'}
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
                padding: isMobile ? '2px 4px' : '2px 6px',
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
          {!atWarWithIran && (
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
                padding: isMobile ? '2px 4px' : '2px 6px',
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

        <Sep />

        {/* Help toggle */}
        <ToggleBtn active={showHelp} onClick={() => setShowHelp(!showHelp)} label="?" compact={isMobile} />
      </div>

      {/* Close ROE dropdown on outside click */}
      {roeOpen && (
        <div
          onClick={() => setRoeOpen(false)}
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
        padding: compact ? '2px 4px' : '2px 6px',
        textTransform: 'uppercase',
        fontWeight: 600,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
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
        padding: compact ? '2px 4px' : '2px 6px',
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
