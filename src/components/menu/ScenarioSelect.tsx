import { useState, type CSSProperties } from 'react'
import { useMenuStore } from '@/store/menu-store'

// ── Scenario data (hardcoded fallback until @/data/scenarios/index exists) ──

interface ScenarioInfo {
  id: string
  name: string
  year: number
  description: string
  nations: string[]
  difficulty: 'Easy' | 'Medium' | 'Hard'
}

const SCENARIOS: ScenarioInfo[] = [
  {
    id: 'persian_gulf_2026',
    name: 'Persian Gulf 2026',
    year: 2026,
    description:
      'Tensions boil over in the Strait of Hormuz. The US 5th Fleet faces Iran\'s layered ' +
      'air defenses, ballistic missiles, and fast attack craft. Strike decisively or lose the initiative.',
    nations: ['USA', 'Iran'],
    difficulty: 'Medium',
  },
]

// ── Styles ──────────────────────────────────────────────────────────

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  background: 'var(--bg-primary)',
  fontFamily: 'var(--font-mono)',
  overflowY: 'auto',
}

const gridBg: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundImage:
    'linear-gradient(rgba(88,166,255,0.03) 1px, transparent 1px), ' +
    'linear-gradient(90deg, rgba(88,166,255,0.03) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
  pointerEvents: 'none',
}

const content: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  maxWidth: 720,
  padding: '48px 24px',
}

const backBtn: CSSProperties = {
  background: 'none',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--panel-radius)',
  padding: '6px 16px',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  color: 'var(--text-secondary)',
  letterSpacing: '0.1em',
  marginBottom: 32,
  transition: 'border-color 0.15s',
}

const header: CSSProperties = {
  fontSize: 'var(--font-size-xl)',
  fontWeight: 700,
  letterSpacing: '0.15em',
  color: 'var(--text-primary)',
  textTransform: 'uppercase',
  marginBottom: 8,
}

const subheader: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--text-muted)',
  letterSpacing: '0.1em',
  marginBottom: 32,
}

const DIFFICULTY_COLORS: Record<string, string> = {
  Easy: 'var(--status-ready)',
  Medium: 'var(--status-engaged)',
  Hard: 'var(--status-damaged)',
}

// ── Components ──────────────────────────────────────────────────────

function ScenarioCard({
  scenario,
  selected,
  onClick,
}: {
  scenario: ScenarioInfo
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
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: selected ? 'var(--bg-hover)' : 'transparent',
        border: selected
          ? '1px solid var(--border-accent)'
          : '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: '20px 24px',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        transition: 'border-color 0.15s, background 0.15s',
        marginBottom: 12,
        boxShadow: selected ? '0 0 20px rgba(56,139,253,0.08)' : 'none',
        ...(hovered && !selected
          ? { background: 'var(--bg-hover)', borderColor: 'var(--text-muted)' }
          : {}),
      }}
    >
      {/* Top row: name + year + difficulty */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 10,
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: selected ? 'var(--text-accent)' : 'var(--text-primary)',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          {scenario.name}
        </span>
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.05em',
          }}
        >
          {scenario.year}
        </span>
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            color: DIFFICULTY_COLORS[scenario.difficulty] ?? 'var(--text-secondary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {scenario.difficulty}
        </span>
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          marginBottom: 12,
        }}
      >
        {scenario.description}
      </div>

      {/* Nations */}
      <div style={{ display: 'flex', gap: 8 }}>
        {scenario.nations.map((n) => (
          <span
            key={n}
            style={{
              fontSize: 'var(--font-size-xs)',
              padding: '2px 8px',
              border: `1px solid ${n === 'USA' ? 'var(--usa-primary)' : 'var(--iran-primary)'}`,
              borderRadius: 3,
              color: n === 'USA' ? 'var(--usa-primary)' : 'var(--iran-primary)',
              letterSpacing: '0.06em',
              fontWeight: 600,
            }}
          >
            {n}
          </span>
        ))}
      </div>
    </button>
  )
}

// ── Main ────────────────────────────────────────────────────────────

export default function ScenarioSelect() {
  const screen = useMenuStore((s) => s.screen)
  const setScreen = useMenuStore((s) => s.setScreen)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (screen !== 'scenario-select') return null

  const handleLaunch = () => {
    if (!selectedId) return
    // Transition to playing state; team lead wires this to initBridge / worker
    setScreen('playing')
  }

  return (
    <div style={overlay}>
      <div style={gridBg} />
      <div style={content}>
        <button
          onClick={() => setScreen('start')}
          style={backBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--text-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-default)'
          }}
        >
          &larr; BACK
        </button>

        <div style={header}>SELECT SCENARIO</div>
        <div style={subheader}>
          Choose a scenario to deploy into
        </div>

        {/* Scenario cards */}
        <div style={{ marginBottom: 32 }}>
          {SCENARIOS.map((s) => (
            <ScenarioCard
              key={s.id}
              scenario={s}
              selected={selectedId === s.id}
              onClick={() => setSelectedId(s.id)}
            />
          ))}
        </div>

        {/* Launch button */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={handleLaunch}
            disabled={!selectedId}
            style={{
              background: selectedId ? 'var(--text-accent)' : 'transparent',
              border: selectedId
                ? '1px solid var(--text-accent)'
                : '1px solid var(--border-default)',
              borderRadius: 'var(--panel-radius)',
              padding: '12px 56px',
              cursor: selectedId ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-base)',
              fontWeight: 700,
              letterSpacing: '0.15em',
              color: selectedId ? '#fff' : 'var(--text-muted)',
              textTransform: 'uppercase',
              transition: 'all 0.15s',
              opacity: selectedId ? 1 : 0.5,
            }}
          >
            LAUNCH
          </button>
        </div>
      </div>
    </div>
  )
}
