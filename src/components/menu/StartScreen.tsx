import { useState, type CSSProperties } from 'react'
import { useMenuStore } from '@/store/menu-store'
import type { NationId } from '@/types/game'

// ── Styles ──────────────────────────────────────────────────────────

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg-primary)',
  fontFamily: 'var(--font-mono)',
}

const gridBg: CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'linear-gradient(rgba(88,166,255,0.03) 1px, transparent 1px), ' +
    'linear-gradient(90deg, rgba(88,166,255,0.03) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
  pointerEvents: 'none',
}

const scanline: CSSProperties = {
  position: 'absolute',
  inset: 0,
  background:
    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
  pointerEvents: 'none',
}

const title: CSSProperties = {
  fontSize: 'clamp(2rem, 5vw, 3.5rem)',
  fontWeight: 700,
  letterSpacing: '0.25em',
  color: 'var(--text-primary)',
  textTransform: 'uppercase',
  marginBottom: 4,
  textShadow: '0 0 30px rgba(88,166,255,0.15)',
}

const subtitle: CSSProperties = {
  fontSize: 'clamp(0.6rem, 1.2vw, 0.75rem)',
  letterSpacing: '0.35em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  marginBottom: 48,
}

const modeRow: CSSProperties = {
  display: 'flex',
  gap: 20,
  marginBottom: 36,
  flexWrap: 'wrap',
  justifyContent: 'center',
}

const sideRow: CSSProperties = {
  display: 'flex',
  gap: 12,
  marginBottom: 36,
  alignItems: 'center',
}

// ── Components ──────────────────────────────────────────────────────

function ModeCard({
  label,
  description,
  selected,
  onClick,
}: {
  label: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'transparent',
        border: selected
          ? '1px solid var(--border-accent)'
          : '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: '24px 32px',
        minWidth: 220,
        maxWidth: 280,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-mono)',
        transition: 'border-color 0.15s, background 0.15s',
        boxShadow: selected ? '0 0 20px rgba(56,139,253,0.1)' : 'none',
        ...(hovered && !selected
          ? { background: 'var(--bg-hover)', borderColor: 'var(--text-muted)' }
          : {}),
      }}
    >
      <div
        style={{
          fontSize: 'var(--font-size-lg)',
          fontWeight: 700,
          letterSpacing: '0.1em',
          color: selected ? 'var(--text-accent)' : 'var(--text-primary)',
          marginBottom: 8,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}
      >
        {description}
      </div>
    </button>
  )
}

function NationToggle({
  nation,
  selected,
  onClick,
}: {
  nation: NationId
  selected: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const color = nation === 'usa' ? 'var(--usa-primary)' : 'var(--iran-primary)'
  const label = nation === 'usa' ? 'USA' : 'IRAN'

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: selected ? color : 'transparent',
        border: `1px solid ${selected ? color : 'var(--border-default)'}`,
        borderRadius: 'var(--panel-radius)',
        padding: '10px 28px',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-base)',
        fontWeight: 700,
        letterSpacing: '0.12em',
        color: selected ? '#fff' : color,
        transition: 'all 0.15s',
        ...(hovered && !selected ? { borderColor: color, background: `${color}22` } : {}),
      }}
    >
      {label}
    </button>
  )
}

// ── Main ────────────────────────────────────────────────────────────

export default function StartScreen() {
  const screen = useMenuStore((s) => s.screen)
  const selectedMode = useMenuStore((s) => s.selectedMode)
  const selectedNation = useMenuStore((s) => s.selectedNation)
  const setScreen = useMenuStore((s) => s.setScreen)
  const setSelectedMode = useMenuStore((s) => s.setSelectedMode)
  const setSelectedNation = useMenuStore((s) => s.setSelectedNation)

  if (screen !== 'start') return null

  const canProceed = selectedMode !== null

  const handleProceed = () => {
    if (!selectedMode) return
    if (selectedMode === 'scenario') {
      setScreen('scenario-select')
    } else {
      setScreen('free-lobby')
    }
  }

  return (
    <div style={overlay}>
      <div style={gridBg} />
      <div style={scanline} />

      <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 20px' }}>
        <div style={title}>REALPOLITIK</div>
        <div style={subtitle}>GEOPOLITICAL STRATEGY SIMULATOR</div>

        {/* Mode selection */}
        <div style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              marginBottom: 12,
            }}
          >
            SELECT MODE
          </div>
          <div style={modeRow}>
            <ModeCard
              label="SCENARIO"
              description="Historical scenarios with preset forces and objectives"
              selected={selectedMode === 'scenario'}
              onClick={() => setSelectedMode('scenario')}
            />
            <ModeCard
              label="FREE MODE"
              description="Sandbox: custom budget, pick your own forces"
              selected={selectedMode === 'free'}
              onClick={() => setSelectedMode('free')}
            />
          </div>
        </div>

        {/* Side selection — only for free mode (scenario mode picks nation after scenario) */}
        {selectedMode === 'free' && (
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.2em',
                marginBottom: 12,
              }}
            >
              SELECT SIDE
            </div>
            <div style={sideRow}>
              <NationToggle
                nation="usa"
                selected={selectedNation === 'usa'}
                onClick={() => setSelectedNation('usa')}
              />
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 'var(--font-size-xs)',
                  letterSpacing: '0.1em',
                }}
              >
                VS
              </span>
              <NationToggle
                nation="iran"
                selected={selectedNation === 'iran'}
                onClick={() => setSelectedNation('iran')}
              />
            </div>
          </div>
        )}

        {/* Proceed button */}
        <button
          onClick={handleProceed}
          disabled={!canProceed}
          style={{
            background: canProceed ? 'var(--text-accent)' : 'transparent',
            border: canProceed
              ? '1px solid var(--text-accent)'
              : '1px solid var(--border-default)',
            borderRadius: 'var(--panel-radius)',
            padding: '12px 48px',
            cursor: canProceed ? 'pointer' : 'not-allowed',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-base)',
            fontWeight: 700,
            letterSpacing: '0.15em',
            color: canProceed ? '#fff' : 'var(--text-muted)',
            textTransform: 'uppercase',
            transition: 'all 0.15s',
            opacity: canProceed ? 1 : 0.5,
          }}
        >
          CONTINUE
        </button>

        {/* Version tag */}
        <div
          style={{
            marginTop: 48,
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
          }}
        >
          v0.0.9 // UPDATED 2026-04-07 01:15
        </div>
      </div>
    </div>
  )
}
