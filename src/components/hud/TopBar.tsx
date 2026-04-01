import { useState } from 'react'
import { useUIStore } from '@/store/ui-store'

const PANEL_TOGGLES = [
  { key: 'orbat' as const, label: 'ORBAT', shortcut: 'O' },
  { key: 'stats' as const, label: 'STATS', shortcut: 'S' },
  { key: 'economy' as const, label: 'ECON', shortcut: 'E' },
  { key: 'command' as const, label: 'CMD', shortcut: 'C' },
] as const

export default function TopBar() {
  const showRangeRings = useUIStore((s) => s.showRangeRings)
  const toggleRangeRings = useUIStore((s) => s.toggleRangeRings)
  const showOrbat = useUIStore((s) => s.showOrbat)
  const showStats = useUIStore((s) => s.showStats)
  const showEconomy = useUIStore((s) => s.showEconomy)
  const showCommand = useUIStore((s) => s.showCommand)
  const togglePanel = useUIStore((s) => s.togglePanel)
  const [showHelp, setShowHelp] = useState(false)

  const panelStates: Record<string, boolean> = {
    orbat: showOrbat,
    stats: showStats,
    economy: showEconomy,
    command: showCommand,
  }

  return (
    <>
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: '4px 6px',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
      }}>
        <ToggleBtn active={showRangeRings} onClick={toggleRangeRings} label="RINGS" />
        <Sep />
        {PANEL_TOGGLES.map(({ key, label }) => (
          <ToggleBtn
            key={key}
            active={panelStates[key]}
            onClick={() => togglePanel(key)}
            label={label}
          />
        ))}
        <Sep />
        <ToggleBtn active={showHelp} onClick={() => setShowHelp(!showHelp)} label="?" />
      </div>

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
          <HelpRow keys="STATS" desc="Situation report / ammo" />
          <HelpRow keys="ECON" desc="Economy comparison" />
          <HelpRow keys="CMD" desc="ROE + war declaration" />
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

function ToggleBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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
        padding: '2px 6px',
        textTransform: 'uppercase',
        fontWeight: 600,
        letterSpacing: '0.03em',
      }}
    >
      {label}
    </button>
  )
}

function Sep() {
  return <div style={{ width: 1, height: 14, background: 'var(--border-default)' }} />
}

function HelpRow({ keys, desc }: { keys: string; desc: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', gap: 12 }}>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{keys}</span>
      <span>{desc}</span>
    </div>
  )
}
