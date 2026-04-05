import { useState, useCallback, useRef } from 'react'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import type { IntelBudget } from '@/types/game'

const SLIDER_STYLE: React.CSSProperties = {
  width: '100%',
  height: 4,
  accentColor: 'var(--text-accent)',
  cursor: 'pointer',
  margin: '2px 0',
}

const LABEL_STYLE: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--font-size-xs)',
  fontFamily: 'var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const VALUE_STYLE: React.CSSProperties = {
  color: 'var(--text-accent)',
  fontSize: 'var(--font-size-xs)',
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  minWidth: 30,
  textAlign: 'right',
}

const EFFECT_STYLE: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.55rem',
  fontFamily: 'var(--font-mono)',
  lineHeight: 1.4,
  marginTop: 1,
}

/** Compute HUMINT effect description based on budget values */
function humintEffect(total_pct: number, humint_pct: number): string {
  // Formula from espionage.ts: 0.005 * (humint_pct / 10) * (total_pct / 10) per unit per hour
  // For ~50 enemy units, expected reveals = 50 * chance
  const chancePerUnit = 0.005 * (humint_pct / 10) * (total_pct / 10)
  const expectedReveals = (50 * chancePerUnit).toFixed(1)
  return `~${expectedReveals} enemy units revealed/hr`
}

/** Compute SIGINT effect description */
function sigintEffect(sigint_pct: number): string {
  // Formula from espionage.ts: 1.5 + (sigint_pct / 100) * 0.5
  const mult = 1.5 + (sigint_pct / 100) * 0.5
  return `ELINT range ${mult.toFixed(2)}x`
}

/** Compute satellite effect description */
function satelliteEffect(total_pct: number, satellite_pct: number): string {
  // Satellite effectiveness is proportional to budget
  const satBudgetFactor = (total_pct / 30) * (satellite_pct / 100)
  const passesPerHour = Math.max(0, (satBudgetFactor * 2)).toFixed(1)
  const swathKm = Math.round(50 + satBudgetFactor * 150)
  return `~${passesPerHour} passes/hr, ${swathKm}km swath`
}

/**
 * Redistribute allocation percentages when one slider changes.
 * When `changed` increases by N, decrease the others proportionally to keep sum at 100.
 */
function redistributeAllocation(
  newValue: number,
  changedKey: 'humint_pct' | 'sigint_pct' | 'satellite_pct',
  current: { humint_pct: number; sigint_pct: number; satellite_pct: number },
): { humint_pct: number; sigint_pct: number; satellite_pct: number } {
  const keys: ('humint_pct' | 'sigint_pct' | 'satellite_pct')[] = ['humint_pct', 'sigint_pct', 'satellite_pct']
  const otherKeys = keys.filter(k => k !== changedKey)
  const remaining = 100 - newValue
  const otherSum = otherKeys.reduce((sum, k) => sum + current[k], 0)

  const result = { ...current, [changedKey]: newValue }

  if (otherSum === 0) {
    // Split remaining equally among others
    const each = Math.round(remaining / otherKeys.length)
    result[otherKeys[0]] = remaining - each
    result[otherKeys[1]] = each
  } else {
    // Distribute proportionally
    let distributed = 0
    for (let i = 0; i < otherKeys.length; i++) {
      const k = otherKeys[i]
      if (i === otherKeys.length - 1) {
        // Last one gets the remainder to avoid rounding drift
        result[k] = remaining - distributed
      } else {
        result[k] = Math.round((current[k] / otherSum) * remaining)
        distributed += result[k]
      }
    }
  }

  // Clamp all to 0-100
  for (const k of keys) {
    result[k] = Math.max(0, Math.min(100, result[k]))
  }

  return result
}

export default function IntelBudgetPanel() {
  const playerNation = useGameStore(s => s.viewState.playerNation)
  const nations = useGameStore(s => s.viewState.nations)
  const [collapsed, setCollapsed] = useState(false)

  const playerNationData = nations.find(n => n.id === playerNation)
  const currentBudget: IntelBudget = playerNationData?.intelBudget ?? {
    total_pct: 15,
    humint_pct: 33,
    sigint_pct: 34,
    satellite_pct: 33,
  }

  // Local state for responsive sliders (mirrors server state, updated on input)
  const [localBudget, setLocalBudget] = useState<IntelBudget | null>(null)
  const budget = localBudget ?? currentBudget

  // Debounce sending commands to worker
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sendBudgetUpdate = useCallback((newBudget: IntelBudget) => {
    setLocalBudget(newBudget)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      sendCommand({ type: 'SET_INTEL_BUDGET', budget: newBudget })
      // Clear local override after syncing so we track server state again
      setLocalBudget(null)
    }, 150)
  }, [])

  const handleTotalChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTotal = Number(e.target.value)
    sendBudgetUpdate({ ...budget, total_pct: newTotal })
  }, [budget, sendBudgetUpdate])

  const handleAllocationChange = useCallback((key: 'humint_pct' | 'sigint_pct' | 'satellite_pct', value: number) => {
    const newAlloc = redistributeAllocation(value, key, budget)
    sendBudgetUpdate({ ...budget, ...newAlloc })
  }, [budget, sendBudgetUpdate])

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 4px',
          borderBottom: '1px solid var(--text-accent)44',
          marginBottom: 4,
          userSelect: 'none',
          cursor: 'pointer',
        }}
        onClick={() => setCollapsed(c => !c)}
      >
        <span
          style={{ fontSize: 8, color: 'var(--text-muted)' }}
        >
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
        <span
          style={{
            color: 'var(--text-accent)',
            fontWeight: 700,
            fontSize: 'var(--font-size-sm)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            flex: 1,
          }}
        >
          BUDGET ALLOCATION
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 4px' }}>
          {/* Total Intel Budget */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={LABEL_STYLE}>TOTAL INTEL BUDGET</span>
              <span style={VALUE_STYLE}>{budget.total_pct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={1}
              value={budget.total_pct}
              onChange={handleTotalChange}
              style={SLIDER_STYLE}
              aria-label="Total intelligence budget percentage"
            />
            <div style={EFFECT_STYLE}>
              of military budget
            </div>
          </div>

          {/* Divider */}
          <div style={{
            borderTop: '1px solid var(--border-default)',
            margin: '6px 0',
          }} />

          {/* HUMINT */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={LABEL_STYLE}>HUMINT</span>
              <span style={VALUE_STYLE}>{budget.humint_pct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={budget.humint_pct}
              onChange={e => handleAllocationChange('humint_pct', Number(e.target.value))}
              style={SLIDER_STYLE}
              aria-label="HUMINT allocation percentage"
            />
            <div style={EFFECT_STYLE}>
              {humintEffect(budget.total_pct, budget.humint_pct)}
            </div>
          </div>

          {/* SIGINT */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={LABEL_STYLE}>SIGINT</span>
              <span style={VALUE_STYLE}>{budget.sigint_pct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={budget.sigint_pct}
              onChange={e => handleAllocationChange('sigint_pct', Number(e.target.value))}
              style={SLIDER_STYLE}
              aria-label="SIGINT allocation percentage"
            />
            <div style={EFFECT_STYLE}>
              {sigintEffect(budget.sigint_pct)}
            </div>
          </div>

          {/* SATELLITE */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={LABEL_STYLE}>SATELLITE</span>
              <span style={VALUE_STYLE}>{budget.satellite_pct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={budget.satellite_pct}
              onChange={e => handleAllocationChange('satellite_pct', Number(e.target.value))}
              style={SLIDER_STYLE}
              aria-label="Satellite recon allocation percentage"
            />
            <div style={EFFECT_STYLE}>
              {satelliteEffect(budget.total_pct, budget.satellite_pct)}
            </div>
          </div>

          {/* Allocation sum indicator */}
          <div style={{
            ...EFFECT_STYLE,
            textAlign: 'right',
            marginTop: 4,
            color: (budget.humint_pct + budget.sigint_pct + budget.satellite_pct) === 100
              ? 'var(--text-muted)'
              : 'var(--status-damaged)',
          }}>
            TOTAL: {budget.humint_pct + budget.sigint_pct + budget.satellite_pct}%
          </div>
        </div>
      )}
    </div>
  )
}
