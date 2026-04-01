import { useCallback, useEffect, useMemo, useState } from 'react'
import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useGameStore } from '@/store/game-store'
import { useAttackPlanStore } from '@/store/attack-plan-store'
import { useUIStore } from '@/store/ui-store'
import { computeAttackPlan } from '@/engine/attack-planner'
import { sendCommand } from '@/store/bridge'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { AttackPriority, Severity, TimingMode, PlannedStrike } from '@/types/attack-plan'
import type { UnitCategory } from '@/types/game'

const SEVERITY_OPTIONS: { value: Severity; label: string; desc: string }[] = [
  { value: 'surgical', label: 'SURGICAL', desc: '1 per target' },
  { value: 'standard', label: 'STANDARD', desc: 'AD-adjusted' },
  { value: 'overwhelming', label: 'OVERWHELMING', desc: '2x standard' },
]

const TIMING_OPTIONS: { value: TimingMode; label: string; desc: string }[] = [
  { value: 'simultaneous', label: 'SIMULTANEOUS', desc: 'All at T+0' },
  { value: 'staggered', label: 'STAGGERED', desc: '30s between tiers' },
  { value: 'sequential', label: 'SEQUENTIAL', desc: '10min between tiers' },
]

const TARGET_CATEGORIES: { value: UnitCategory; label: string }[] = [
  { value: 'sam_site', label: 'SAM Sites' },
  { value: 'missile_battery', label: 'Missile Batteries' },
  { value: 'airbase', label: 'Airbases' },
  { value: 'naval_base', label: 'Naval Bases' },
  { value: 'ship', label: 'Ships' },
  { value: 'submarine', label: 'Submarines' },
  { value: 'carrier_group', label: 'Carrier Groups' },
]

let priorityCounter = 0

export default function AttackPlanPanel() {
  const units = useGameStore((s) => s.viewState.units)
  const togglePanel = useUIStore((s) => s.togglePanel)

  const {
    draftPriorities, draftTiming, draftName,
    computedPlan, executing, executionProgress,
    addPriority, removePriority, updatePriority, reorderPriorities,
    setTiming, setComputedPlan, startExecution, updateProgress, finishExecution, reset,
  } = useAttackPlanStore()

  const [confirmExecute, setConfirmExecute] = useState(false)

  const friendlyUnits = useMemo(() => units.filter(u => u.nation === 'usa' && u.status !== 'destroyed'), [units])
  const enemyUnits = useMemo(() => units.filter(u => u.nation !== 'usa' && u.status !== 'destroyed'), [units])

  // Recompute plan whenever draft changes
  useEffect(() => {
    if (draftPriorities.length === 0) {
      setComputedPlan(null)
      return
    }
    const plan = computeAttackPlan(draftPriorities, draftTiming, friendlyUnits, enemyUnits, draftName)
    setComputedPlan(plan)
  }, [draftPriorities, draftTiming, draftName, friendlyUnits, enemyUnits, setComputedPlan])

  const handleAddPriority = useCallback((category: UnitCategory) => {
    addPriority({
      id: `p_${++priorityCounter}`,
      targetCategory: category,
      severity: 'standard',
      seadFirst: category !== 'sam_site', // auto-SEAD except when targeting SAMs directly
      weaponPreference: 'any',
      launcherPreference: 'any',
    })
  }, [addPriority])

  const handleExecute = useCallback(async () => {
    if (!computedPlan || executing) return
    startExecution()

    const strikes = computedPlan.strikes.filter(s => s.inRange)
    const tierGroups = new Map<number, PlannedStrike[]>()
    for (const s of strikes) {
      const group = tierGroups.get(s.priorityTier) ?? []
      group.push(s)
      tierGroups.set(s.priorityTier, group)
    }

    const tiers = Array.from(tierGroups.entries()).sort(([a], [b]) => a - b)
    let fired = 0
    const total = strikes.reduce((s, st) => s + st.count, 0)

    for (let ti = 0; ti < tiers.length; ti++) {
      const [, tierStrikes] = tiers[ti]

      // Stagger delay between tiers
      if (ti > 0) {
        const delayMs = draftTiming === 'staggered' ? 30_000 :
                        draftTiming === 'sequential' ? 600_000 : 0
        if (delayMs > 0) {
          await new Promise(r => setTimeout(r, Math.min(delayMs / 100, 3000))) // scaled for UX
        }
      }

      for (const strike of tierStrikes) {
        for (let i = 0; i < strike.count; i++) {
          await sendCommand({
            type: 'LAUNCH_MISSILE',
            launcherId: strike.launcherId,
            weaponId: strike.weaponId,
            targetId: strike.targetId,
          })
          fired++
          updateProgress(fired / total)
        }
      }
    }

    finishExecution()
    setConfirmExecute(false)
  }, [computedPlan, executing, draftTiming, startExecution, updateProgress, finishExecution])

  // Categories not yet in priorities
  const availableCategories = TARGET_CATEGORIES.filter(
    tc => !draftPriorities.some(p => p.targetCategory === tc.value)
  )

  return (
    <Panel
      title="PRESIDENTIAL STRIKE AUTHORIZATION"
      style={{ position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)', width: 520, maxHeight: '85vh' }}
      onClose={() => { reset(); togglePanel('attackPlan') }}
    >
      {/* Target Priorities */}
      <Section title="TARGET PRIORITIES">
        {draftPriorities.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0' }}>
            No targets selected. Add priority tiers below.
          </div>
        )}
        {draftPriorities.map((p, idx) => (
          <PriorityRow
            key={p.id}
            priority={p}
            index={idx}
            total={draftPriorities.length}
            enemyCount={enemyUnits.filter(u => u.category === p.targetCategory).length}
            onUpdate={(changes) => updatePriority(p.id, changes)}
            onRemove={() => removePriority(p.id)}
            onMoveUp={() => idx > 0 && reorderPriorities(idx, idx - 1)}
            onMoveDown={() => idx < draftPriorities.length - 1 && reorderPriorities(idx, idx + 1)}
          />
        ))}

        {availableCategories.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) handleAddPriority(e.target.value as UnitCategory)
              }}
              style={selectStyle}
            >
              <option value="">+ ADD TARGET TYPE...</option>
              {availableCategories.map(tc => (
                <option key={tc.value} value={tc.value}>
                  {tc.label} ({enemyUnits.filter(u => u.category === tc.value).length} targets)
                </option>
              ))}
            </select>
          </div>
        )}
      </Section>

      {/* Timing */}
      <Section title="TIMING">
        <div style={{ display: 'flex', gap: 4 }}>
          {TIMING_OPTIONS.map(t => (
            <button
              key={t.value}
              onClick={() => setTiming(t.value)}
              style={{
                flex: 1,
                padding: '4px 6px',
                background: draftTiming === t.value ? 'var(--bg-hover)' : 'transparent',
                border: `1px solid ${draftTiming === t.value ? 'var(--border-accent)' : 'var(--border-default)'}`,
                borderRadius: 4,
                color: draftTiming === t.value ? 'var(--text-accent)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              <div>{t.label}</div>
              <div style={{ fontSize: '0.5rem', fontWeight: 400 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </Section>

      {/* Plan Preview */}
      {computedPlan && (
        <>
          <Section title="STRIKE PLAN PREVIEW">
            <PlanPreview plan={computedPlan} />
          </Section>

          <Section title="SUMMARY">
            <PlanSummary plan={computedPlan} />
          </Section>
        </>
      )}

      {/* Execute */}
      <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
        <button
          onClick={() => { reset(); togglePanel('attackPlan') }}
          style={{ ...btnStyle, flex: 1, color: 'var(--text-muted)' }}
        >
          CANCEL
        </button>

        {executing ? (
          <div style={{ flex: 2, textAlign: 'center' }}>
            <div style={{ color: 'var(--status-engaged)', fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>
              EXECUTING... {Math.round(executionProgress * 100)}%
            </div>
            <div style={{ height: 4, background: 'var(--bg-hover)', borderRadius: 2, marginTop: 4 }}>
              <div style={{ width: `${executionProgress * 100}%`, height: '100%', background: 'var(--status-engaged)', borderRadius: 2 }} />
            </div>
          </div>
        ) : (
          <button
            disabled={!computedPlan || computedPlan.strikes.length === 0}
            onClick={() => {
              if (confirmExecute) {
                handleExecute()
              } else {
                setConfirmExecute(true)
                setTimeout(() => setConfirmExecute(false), 3000)
              }
            }}
            style={{
              ...btnStyle,
              flex: 2,
              background: confirmExecute ? '#cc2222' : 'var(--iran-secondary)',
              color: '#fff',
              fontWeight: 700,
              opacity: computedPlan && computedPlan.strikes.length > 0 ? 1 : 0.4,
            }}
          >
            {confirmExecute ? 'CONFIRM — AUTHORIZE STRIKE' : 'AUTHORIZE STRIKE'}
          </button>
        )}
      </div>
    </Panel>
  )
}

// ═══════════════════════════════════════════════
//  Sub-components
// ═══════════════════════════════════════════════

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        color: 'var(--text-muted)',
        fontSize: '0.6rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        fontWeight: 600,
        marginBottom: 4,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function PriorityRow({ priority: p, index, total, enemyCount, onUpdate, onRemove, onMoveUp, onMoveDown }: {
  priority: AttackPriority
  index: number
  total: number
  enemyCount: number
  onUpdate: (changes: Partial<AttackPriority>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const label = TARGET_CATEGORIES.find(tc => tc.value === p.targetCategory)?.label ?? p.targetCategory

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '4px 6px',
      background: 'var(--bg-hover)',
      borderRadius: 4,
      marginBottom: 3,
      borderLeft: '3px solid var(--border-accent)',
    }}>
      {/* Reorder */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <SmallBtn label="^" onClick={onMoveUp} disabled={index === 0} />
        <SmallBtn label="v" onClick={onMoveDown} disabled={index === total - 1} />
      </div>

      {/* Priority number */}
      <span style={{ color: 'var(--text-accent)', fontWeight: 700, fontSize: 'var(--font-size-xs)', minWidth: 16 }}>
        {index + 1}
      </span>

      {/* Category + count */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>
          {enemyCount} target{enemyCount !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Severity */}
      <select
        value={p.severity}
        onChange={(e) => onUpdate({ severity: e.target.value as Severity })}
        style={{ ...selectStyle, width: 100, fontSize: '0.6rem' }}
      >
        {SEVERITY_OPTIONS.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      {/* SEAD toggle */}
      <button
        onClick={() => onUpdate({ seadFirst: !p.seadFirst })}
        style={{
          padding: '2px 6px',
          background: p.seadFirst ? 'var(--usa-secondary)' : 'transparent',
          border: `1px solid ${p.seadFirst ? 'var(--usa-primary)' : 'var(--border-default)'}`,
          borderRadius: 3,
          color: p.seadFirst ? 'var(--usa-primary)' : 'var(--text-muted)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.55rem',
          fontWeight: 600,
        }}
        title="Suppress Enemy Air Defenses first"
      >
        SEAD
      </button>

      {/* Remove */}
      <SmallBtn label="x" onClick={onRemove} />
    </div>
  )
}

function PlanPreview({ plan }: { plan: import('@/types/attack-plan').AttackPlan }) {
  // Group strikes by priority tier
  const tiers = new Map<number, PlannedStrike[]>()
  for (const s of plan.strikes) {
    const group = tiers.get(s.priorityTier) ?? []
    group.push(s)
    tiers.set(s.priorityTier, group)
  }

  const sortedTiers = Array.from(tiers.entries()).sort(([a], [b]) => a - b)

  if (sortedTiers.length === 0) {
    return <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No strikes allocated — check priorities and weapon availability.</div>
  }

  return (
    <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.6rem' }}>
      {sortedTiers.map(([tier, strikes]) => {
        const firstStrike = strikes[0]
        const tierLabel = firstStrike?.targetCategory === 'sam_site' ? 'SEAD' :
          TARGET_CATEGORIES.find(tc => tc.value === firstStrike?.targetCategory)?.label?.toUpperCase() ?? `TIER ${tier + 1}`

        return (
          <div key={tier} style={{ marginBottom: 6 }}>
            <div style={{ color: 'var(--text-accent)', fontWeight: 700, marginBottom: 2 }}>
              TIER {tier + 1} — {tierLabel}
            </div>
            {strikes.map((s, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '1px 4px',
                color: s.inRange ? 'var(--text-primary)' : 'var(--status-damaged)',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {s.targetName}
                </span>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>
                  {s.count}x {s.weaponName.split(' ')[0]} ({s.launcherName.split(' ').slice(0, 2).join(' ')})
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

function PlanSummary({ plan }: { plan: import('@/types/attack-plan').AttackPlan }) {
  const { summary } = plan

  return (
    <div style={{ fontSize: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>Total Missiles: <b style={{ color: 'var(--text-accent)' }}>{summary.totalMissiles}</b></span>
        <span>Targets: <b style={{ color: 'var(--text-accent)' }}>{summary.totalTargets}</b></span>
        <span>Est. Kills: <b style={{ color: 'var(--status-ready)' }}>{summary.estimatedKills}</b></span>
      </div>

      {/* Weapon budget bars */}
      {Object.entries(summary.weaponBudget).map(([weaponId, budget]) => {
        const name = weaponSpecs[weaponId]?.name ?? weaponId
        const pct = budget.available > 0 ? budget.needed / budget.available : 1
        return (
          <StatBar
            key={weaponId}
            label={name}
            value={budget.needed}
            max={budget.available}
            color={pct > 0.8 ? 'var(--status-damaged)' : pct > 0.5 ? 'var(--status-engaged)' : 'var(--text-accent)'}
          />
        )
      })}

      <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
        Est. penetration: <b style={{ color: 'var(--text-accent)' }}>{Math.round(summary.estimatedPenetration * 100)}%</b>
      </div>

      {/* Warnings */}
      {summary.warnings.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {summary.warnings.map((w, i) => (
            <div key={i} style={{ color: 'var(--status-engaged)', fontSize: '0.55rem' }}>
              ! {w}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SmallBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none',
        border: 'none',
        color: disabled ? 'var(--bg-hover)' : 'var(--text-muted)',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.6rem',
        padding: '0 3px',
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  )
}

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  padding: '3px 6px',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  width: '100%',
}

const btnStyle: React.CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg-hover)',
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 600,
  textTransform: 'uppercase',
}
