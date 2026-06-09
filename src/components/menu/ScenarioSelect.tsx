import { useState, type CSSProperties } from 'react'
import { useMenuStore } from '@/store/menu-store'
import { scenarios } from '@/data/scenarios/index'
import type { ScenarioDefinition } from '@/types/scenario'
import type { NationId } from '@/types/game'

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

// ── Components ──────────────────────────────────────────────────────

function ScenarioCard({
  scenario,
  selected,
  onClick,
}: {
  scenario: ScenarioDefinition
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
      {/* Top row: name + year */}
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
              border: '1px solid var(--text-muted)',
              borderRadius: 3,
              color: 'var(--text-secondary)',
              letterSpacing: '0.06em',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {n}
          </span>
        ))}
      </div>
    </button>
  )
}

function NationPicker({
  nations,
  selected,
  onSelect,
}: {
  nations: NationId[]
  selected: NationId
  onSelect: (n: NationId) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
      <span style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-muted)',
        letterSpacing: '0.1em',
        alignSelf: 'center',
        marginRight: 8,
      }}>
        PLAY AS
      </span>
      {nations.map((n) => {
        const isSelected = n === selected
        return (
          <button
            key={n}
            onClick={() => onSelect(n)}
            style={{
              background: isSelected ? 'var(--text-accent)' : 'transparent',
              border: isSelected
                ? '1px solid var(--text-accent)'
                : '1px solid var(--border-default)',
              borderRadius: 'var(--panel-radius)',
              padding: '8px 24px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: isSelected ? '#fff' : 'var(--text-secondary)',
              textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────

export default function ScenarioSelect() {
  const screen = useMenuStore((s) => s.screen)
  const setScreen = useMenuStore((s) => s.setScreen)
  const setSelectedScenarioId = useMenuStore((s) => s.setSelectedScenarioId)
  const setMapCenter = useMenuStore((s) => s.setMapCenter)
  const setSelectedNation = useMenuStore((s) => s.setSelectedNation)
  const selectedNation = useMenuStore((s) => s.selectedNation)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (screen !== 'scenario-select') return null

  const selectedScenario = selectedId ? scenarios.find((s) => s.id === selectedId) : null

  // If the current nation isn't valid for the selected scenario, default to first
  const validNations = selectedScenario?.nations ?? []
  const nationForScenario = validNations.includes(selectedNation)
    ? selectedNation
    : (validNations[0] as NationId | undefined) ?? 'usa'

  const handleSelectScenario = (id: string) => {
    setSelectedId(id)
    const sc = scenarios.find((s) => s.id === id)
    if (sc && !sc.nations.includes(selectedNation)) {
      setSelectedNation(sc.nations[0] as NationId)
    }
  }

  const handleLaunch = () => {
    if (!selectedId || !selectedScenario) return
    setSelectedScenarioId(selectedId)
    setSelectedNation(nationForScenario)
    setMapCenter(selectedScenario.mapCenter ?? null)
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
        <div style={{ marginBottom: 24 }}>
          {scenarios.map((s) => (
            <ScenarioCard
              key={s.id}
              scenario={s}
              selected={selectedId === s.id}
              onClick={() => handleSelectScenario(s.id)}
            />
          ))}
        </div>

        {/* Nation picker — shown after selecting a scenario */}
        {selectedScenario && (
          <NationPicker
            nations={validNations as NationId[]}
            selected={nationForScenario}
            onSelect={setSelectedNation}
          />
        )}

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
