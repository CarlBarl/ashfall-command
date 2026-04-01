import { useCallback, useEffect, useMemo, useState } from 'react'
import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useStrikeStore, type StrikeMode, type LauncherAllocation } from '@/store/strike-store'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import { weaponSpecs } from '@/data/weapons/missiles'
import { adSystems } from '@/data/weapons/air-defense'
import { computeAttackPlan } from '@/engine/attack-planner'
import { haversine } from '@/engine/utils/geo'
import type { ViewUnit } from '@/types/view'
import type { WeaponLoadout, UnitCategory, WeaponId } from '@/types/game'
import type { AttackPriority, Severity, TimingMode, PlannedStrike, AttackPlan } from '@/types/attack-plan'

// ════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════

const OFFENSIVE_TYPES = new Set(['cruise_missile', 'ballistic_missile', 'ashm'])

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

const DISTRIBUTION_OPTIONS: { value: 'even' | 'weighted' | 'manual'; label: string }[] = [
  { value: 'even', label: 'EVEN' },
  { value: 'weighted', label: 'WEIGHTED' },
  { value: 'manual', label: 'MANUAL' },
]

// ════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════

function isOffensiveWeapon(wl: WeaponLoadout): boolean {
  const spec = weaponSpecs[wl.weaponId]
  return !!spec && OFFENSIVE_TYPES.has(spec.type)
}

function isSAMWeapon(wl: WeaponLoadout): boolean {
  const spec = weaponSpecs[wl.weaponId]
  return !!spec && spec.type === 'sam'
}

function adSystemForInterceptor(interceptorId: WeaponId) {
  return Object.values(adSystems).find((s) => s.interceptorId === interceptorId)
}

function adMultiplier(target: ViewUnit, enemyUnits: ViewUnit[]): number {
  let totalFireChannels = 0
  for (const eu of enemyUnits) {
    if (eu.category !== 'sam_site' || eu.status === 'destroyed') continue
    const dist = haversine(eu.position, target.position)
    if (dist > 200) continue
    for (const wl of eu.weapons) {
      if (!isSAMWeapon(wl) || wl.count === 0) continue
      const ad = adSystemForInterceptor(wl.weaponId)
      if (ad) totalFireChannels += ad.fire_channels
    }
  }
  if (totalFireChannels === 0) return 1.0
  return Math.min(4.0, 1.0 + totalFireChannels * 0.15)
}

interface AggregatedWeapon {
  weaponId: string
  weaponName: string
  totalCount: number
  totalMax: number
  launchers: { unitId: string; unitName: string; count: number }[]
}

function aggregateWeapons(units: ViewUnit[]): AggregatedWeapon[] {
  const map = new Map<string, AggregatedWeapon>()
  for (const unit of units) {
    for (const w of unit.weapons) {
      const spec = weaponSpecs[w.weaponId]
      if (!spec || spec.type === 'sam' || w.count <= 0) continue
      const existing = map.get(w.weaponId)
      if (existing) {
        existing.totalCount += w.count
        existing.totalMax += w.maxCount
        existing.launchers.push({ unitId: unit.id, unitName: unit.name, count: w.count })
      } else {
        map.set(w.weaponId, {
          weaponId: w.weaponId,
          weaponName: spec.name,
          totalCount: w.count,
          totalMax: w.maxCount,
          launchers: [{ unitId: unit.id, unitName: unit.name, count: w.count }],
        })
      }
    }
  }
  return Array.from(map.values())
}

let priorityCounter = 0

// ════════════════════════════════════════════════════════════════
//  StrikePanel — unified component
// ════════════════════════════════════════════════════════════════

export default function StrikePanel() {
  const strike = useStrikeStore()
  const selectedUnitIds = useUIStore((s) => s.selectedUnitIds)
  const units = useGameStore((s) => s.viewState.units)

  const { mode, open, strikeCluster } = strike

  // Selected friendly units (for DIRECT mode)
  const selectedUnits = useMemo(
    () => units.filter((u) => selectedUnitIds.has(u.id)),
    [units, selectedUnitIds],
  )

  // Check if any selected unit has offensive weapons
  const hasOffensiveWeapons = useMemo(
    () => selectedUnits.some((u) => u.weapons.some(isOffensiveWeapon)),
    [selectedUnits],
  )

  // Visibility logic per mode
  const shouldShow =
    (mode === 'direct' && selectedUnitIds.size > 0 && hasOffensiveWeapons) ||
    (mode === 'configure' && strikeCluster !== null) ||
    (mode === 'plan' && open)

  if (!shouldShow && !open) return null

  // Title per mode
  const title =
    mode === 'plan'
      ? 'PRESIDENTIAL STRIKE AUTHORIZATION'
      : mode === 'configure' && strikeCluster
        ? `STRIKE PANEL \u2014 ${strikeCluster.primary.name}`
        : 'STRIKE PANEL'

  // Position per mode
  const positionStyle: React.CSSProperties =
    mode === 'plan'
      ? { position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)', width: 520, maxHeight: '85vh' }
      : { position: 'absolute', bottom: 12, right: 12, width: 380 }

  return (
    <Panel
      title={title}
      style={positionStyle}
      onClose={() => strike.closeStrike()}
    >
      {/* Tab bar */}
      <TabBar mode={mode} onSetMode={strike.setMode} />

      {/* Tab content */}
      {mode === 'direct' && <DirectFireTab />}
      {mode === 'configure' && <ConfigureTab />}
      {mode === 'plan' && <PlanAttackTab />}
    </Panel>
  )
}

// ════════════════════════════════════════════════════════════════
//  Tab Bar
// ════════════════════════════════════════════════════════════════

function TabBar({ mode, onSetMode }: { mode: StrikeMode; onSetMode: (m: StrikeMode) => void }) {
  const tabs: { value: StrikeMode; label: string }[] = [
    { value: 'direct', label: 'DIRECT FIRE' },
    { value: 'configure', label: 'CONFIGURE' },
    { value: 'plan', label: 'PLAN ATTACK' },
  ]

  return (
    <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onSetMode(t.value)}
          style={{
            flex: 1,
            padding: '4px 6px',
            background: mode === t.value ? 'var(--bg-hover)' : 'transparent',
            border: `1px solid ${mode === t.value ? 'var(--border-accent)' : 'var(--border-default)'}`,
            borderRadius: 4,
            color: mode === t.value ? 'var(--text-accent)' : 'var(--text-muted)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.6rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
//  DIRECT FIRE TAB
// ════════════════════════════════════════════════════════════════

function DirectFireTab() {
  const selectedUnitIds = useUIStore((s) => s.selectedUnitIds)
  const units = useGameStore((s) => s.viewState.units)
  const strike = useStrikeStore()
  const { targetUnitId, targetingMode } = strike

  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const selectedUnits = useMemo(
    () => units.filter((u) => selectedUnitIds.has(u.id)),
    [units, selectedUnitIds],
  )
  const unitCount = selectedUnits.length

  if (unitCount === 0) {
    return <EmptyState text="Select friendly units to fire weapons." />
  }

  const weapons = aggregateWeapons(selectedUnits)
  if (weapons.length === 0) {
    return <EmptyState text="Selected units have no offensive weapons." />
  }

  const target = units.find((u) => u.id === targetUnitId)
  const firstUnit = selectedUnits[0]
  const enemies = units.filter(
    (u) => u.nation !== firstUnit.nation && u.status !== 'destroyed',
  )

  const getQty = (weaponId: string, maxCount: number) => {
    const q = quantities[weaponId] ?? unitCount
    return Math.min(q, maxCount)
  }

  const setQty = (weaponId: string, val: number) => {
    setQuantities((prev) => ({ ...prev, [weaponId]: Math.max(1, val) }))
  }

  const fireSalvo = (weaponId: string, totalCount: number) => {
    if (!targetUnitId) return
    const agg = weapons.find((w) => w.weaponId === weaponId)
    if (!agg) return
    const available = agg.launchers.map((l) => ({ ...l }))
    let remaining = totalCount
    let idx = 0
    let stuck = 0
    while (remaining > 0 && stuck < available.length) {
      const launcher = available[idx % available.length]
      if (launcher.count > 0) {
        sendCommand({
          type: 'LAUNCH_MISSILE',
          launcherId: launcher.unitId,
          weaponId,
          targetId: targetUnitId,
        })
        launcher.count--
        remaining--
        stuck = 0
      } else {
        stuck++
      }
      idx++
    }
  }

  return (
    <>
      {/* Multi-unit indicator */}
      {unitCount > 1 && (
        <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginBottom: 6, fontStyle: 'italic' }}>
          Weapons aggregated from {unitCount} units. Fire distributes evenly.
        </div>
      )}

      {/* Target selection */}
      <div style={{ marginBottom: 10 }}>
        <SectionLabel>Target</SectionLabel>

        {target && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 8px', background: 'rgba(204, 68, 68, 0.15)',
            border: '1px solid var(--iran-secondary)', borderRadius: 4, marginBottom: 6,
          }}>
            <span style={{ color: 'var(--iran-primary)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
              {target.name}
            </span>
            <button
              onClick={() => strike.setTargetUnitId(null)}
              style={clearBtnStyle}
            >
              clear
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => strike.setTargetingMode(!targetingMode)}
            style={{
              flex: 1, padding: '5px 8px',
              background: targetingMode ? 'var(--iran-primary)' : 'var(--bg-hover)',
              border: '1px solid var(--border-default)', borderRadius: 4,
              color: targetingMode ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer', fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)', fontWeight: 600,
            }}
          >
            {targetingMode ? 'CLICK ENEMY ON MAP...' : 'SELECT ON MAP'}
          </button>
        </div>

        <select
          value={targetUnitId ?? ''}
          onChange={(e) => strike.setTargetUnitId(e.target.value || null)}
          style={{ ...selectStyle, marginTop: 4 }}
        >
          <option value="">-- or pick from list --</option>
          {enemies.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.category.replace(/_/g, ' ')}) {t.health < 100 ? `[${t.health}%]` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Weapons with quantity */}
      {weapons.map((w) => {
        const qty = getQty(w.weaponId, w.totalCount)
        const step = unitCount
        return (
          <div key={w.weaponId} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5 }}>
            <div style={{
              display: 'flex', alignItems: 'center',
              background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
              borderRadius: 4, overflow: 'hidden', flexShrink: 0,
            }}>
              <QtyButton label="-" onClick={() => setQty(w.weaponId, qty - step)} />
              <span style={{
                padding: '2px 6px', fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)',
                minWidth: 28, textAlign: 'center',
              }}>
                {qty}
              </span>
              <QtyButton label="+" onClick={() => setQty(w.weaponId, Math.min(qty + step, w.totalCount))} />
            </div>

            <button
              disabled={!targetUnitId || w.totalCount <= 0}
              onClick={() => fireSalvo(w.weaponId, qty)}
              style={{
                flex: 1, display: 'flex', justifyContent: 'space-between',
                padding: '5px 8px',
                background: targetUnitId ? 'var(--iran-secondary)' : 'var(--bg-hover)',
                border: '1px solid var(--border-default)', borderRadius: 4,
                color: 'var(--text-primary)', cursor: targetUnitId ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)',
                opacity: w.totalCount > 0 ? 1 : 0.4,
              }}
            >
              <span>FIRE {w.weaponName}</span>
              <span style={{ color: 'var(--text-muted)' }}>
                {w.totalCount}/{w.totalMax}
                {w.launchers.length > 1 && ` (${w.launchers.length}u)`}
              </span>
            </button>
          </div>
        )
      })}

      {/* Quick salvo presets */}
      {targetUnitId && weapons.length > 0 && (
        <div style={{ marginTop: 6, borderTop: '1px solid var(--border-default)', paddingTop: 6 }}>
          <SectionLabel>Quick Salvo</SectionLabel>
          <div style={{ display: 'flex', gap: 4 }}>
            {[5, 10, 20].map((n) => {
              const w = weapons[0]
              const actual = Math.min(n, w.totalCount)
              return (
                <button
                  key={n}
                  disabled={w.totalCount <= 0}
                  onClick={() => fireSalvo(w.weaponId, actual)}
                  style={{
                    flex: 1, padding: '4px',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border-default)', borderRadius: 4,
                    color: actual < n ? 'var(--text-muted)' : 'var(--text-primary)',
                    cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-size-xs)',
                  }}
                >
                  {n}x {w.weaponName.split(' ')[0]}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════
//  CONFIGURE TAB
// ════════════════════════════════════════════════════════════════

function ConfigureTab() {
  const strikeCluster = useStrikeStore((s) => s.strikeCluster)
  const targets = useStrikeStore((s) => s.targets)
  const severity = useStrikeStore((s) => s.severity)
  const seadFirst = useStrikeStore((s) => s.seadFirst)
  const distribution = useStrikeStore((s) => s.distribution)
  const allocations = useStrikeStore((s) => s.allocations)
  const setAllocations = useStrikeStore((s) => s.setAllocations)
  const toggleTargetCheck = useStrikeStore((s) => s.toggleTargetCheck)
  const setSeverity = useStrikeStore((s) => s.setSeverity)
  const setSeadFirst = useStrikeStore((s) => s.setSeadFirst)
  const setDistribution = useStrikeStore((s) => s.setDistribution)
  const updateAllocation = useStrikeStore((s) => s.updateAllocation)
  const startExecution = useStrikeStore((s) => s.startExecution)
  const updateProgress = useStrikeStore((s) => s.updateProgress)
  const finishExecution = useStrikeStore((s) => s.finishExecution)
  const executing = useStrikeStore((s) => s.executing)
  const executionProgress = useStrikeStore((s) => s.executionProgress)
  const units = useGameStore((s) => s.viewState.units)
  const [expandedLauncher, setExpandedLauncher] = useState<string | null>(null)

  const friendlyUnits = useMemo(
    () => units.filter((u) => u.nation === 'usa' && u.status !== 'destroyed'),
    [units],
  )
  const enemyUnits = useMemo(
    () => units.filter((u) => u.nation !== 'usa' && u.status !== 'destroyed'),
    [units],
  )

  // Auto-allocate when severity/cluster/targets change
  useEffect(() => {
    if (!strikeCluster) return
    const checkedTargets = targets.filter((t) => t.checked)
    if (checkedTargets.length === 0) {
      setAllocations([])
      return
    }

    // Find all target ViewUnits
    const targetUnits = checkedTargets
      .map((t) => units.find((u) => u.id === t.unitId))
      .filter((u): u is ViewUnit => !!u)

    // Compute missiles needed per target
    const allocs: LauncherAllocation[] = []
    const usedAmmo = new Map<string, Map<string, number>>() // unitId -> weaponId -> used

    for (const target of targetUnits) {
      const mult = adMultiplier(target, enemyUnits)
      const needed =
        severity === 'surgical' ? 1 :
        severity === 'standard' ? Math.ceil(mult) :
        Math.ceil(2 * mult)

      // Find launchers in range
      let allocated = 0
      for (const fu of friendlyUnits) {
        if (allocated >= needed) break
        for (const wl of fu.weapons) {
          if (allocated >= needed) break
          if (!isOffensiveWeapon(wl)) continue
          const spec = weaponSpecs[wl.weaponId]
          if (!spec) continue
          const dist = haversine(fu.position, target.position)
          if (dist > spec.range_km) continue

          const usedForUnit = usedAmmo.get(fu.id) ?? new Map()
          const alreadyUsed = usedForUnit.get(wl.weaponId) ?? 0
          const avail = wl.count - alreadyUsed
          if (avail <= 0) continue

          const take = Math.min(needed - allocated, avail)
          usedForUnit.set(wl.weaponId, alreadyUsed + take)
          usedAmmo.set(fu.id, usedForUnit)

          allocs.push({
            unitId: fu.id,
            unitName: fu.name,
            weaponId: wl.weaponId,
            count: take,
            maxAvailable: wl.count,
          })
          allocated += take
        }
      }
    }

    setAllocations(allocs)
  }, [strikeCluster, targets, severity, friendlyUnits, enemyUnits, units, setAllocations])

  if (!strikeCluster) {
    return <EmptyState text='Click TARGET GROUP on an enemy cluster to configure a strike.' />
  }

  const checkedTargets = targets.filter((t) => t.checked)
  const totalMissiles = allocations.reduce((sum, a) => sum + a.count, 0)

  // Group allocations by launcher
  const launcherGroups = new Map<string, LauncherAllocation[]>()
  for (const a of allocations) {
    const group = launcherGroups.get(a.unitId) ?? []
    group.push(a)
    launcherGroups.set(a.unitId, group)
  }

  // Available weapon types that can reach the cluster
  const clusterPos = strikeCluster.position
  const weaponsInRange = useMemo(() => {
    const wmap = new Map<string, { name: string; count: number; launchers: number }>()
    for (const fu of friendlyUnits) {
      for (const wl of fu.weapons) {
        if (!isOffensiveWeapon(wl) || wl.count <= 0) continue
        const spec = weaponSpecs[wl.weaponId]
        if (!spec) continue
        const dist = haversine(fu.position, clusterPos)
        if (dist > spec.range_km) continue
        const existing = wmap.get(wl.weaponId)
        if (existing) {
          existing.count += wl.count
          existing.launchers++
        } else {
          wmap.set(wl.weaponId, { name: spec.name, count: wl.count, launchers: 1 })
        }
      }
    }
    return wmap
  }, [friendlyUnits, clusterPos])

  const handleLaunchStrike = useCallback(async () => {
    if (allocations.length === 0) return
    startExecution()

    const checkedIds = new Set(targets.filter((t) => t.checked).map((t) => t.unitId))
    let fired = 0

    for (const alloc of allocations) {
      const targetPool = [...checkedIds]
      for (let i = 0; i < alloc.count; i++) {
        const targetId = targetPool[i % targetPool.length]
        await sendCommand({
          type: 'LAUNCH_MISSILE',
          launcherId: alloc.unitId,
          weaponId: alloc.weaponId,
          targetId,
        })
        fired++
        updateProgress(fired / totalMissiles)
      }
    }

    finishExecution()
  }, [allocations, targets, totalMissiles, startExecution, updateProgress, finishExecution])

  return (
    <>
      {/* TARGET LIST */}
      <Section title="TARGET LIST">
        {targets.map((t) => (
          <label
            key={t.unitId}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 6px', cursor: 'pointer',
              background: t.checked ? 'rgba(204, 68, 68, 0.08)' : 'transparent',
              borderRadius: 3, marginBottom: 2,
            }}
          >
            <input
              type="checkbox"
              checked={t.checked}
              onChange={() => toggleTargetCheck(t.unitId)}
              style={{ accentColor: 'var(--iran-primary)' }}
            />
            <span style={{
              flex: 1, fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
            }}>
              {t.name}
            </span>
            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
              {t.category.replace(/_/g, ' ')}
            </span>
            {t.health < 100 && (
              <span style={{ fontSize: '0.55rem', color: 'var(--status-damaged)' }}>
                {t.health}%
              </span>
            )}
          </label>
        ))}
      </Section>

      {/* SEVERITY */}
      <Section title="SEVERITY">
        <div style={{ display: 'flex', gap: 4 }}>
          {SEVERITY_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSeverity(s.value)}
              style={{
                flex: 1, padding: '4px 6px',
                background: severity === s.value ? 'var(--bg-hover)' : 'transparent',
                border: `1px solid ${severity === s.value ? 'var(--border-accent)' : 'var(--border-default)'}`,
                borderRadius: 4,
                color: severity === s.value ? 'var(--text-accent)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem', fontWeight: 600, textAlign: 'center',
              }}
            >
              <div>{s.label}</div>
              <div style={{ fontSize: '0.5rem', fontWeight: 400 }}>{s.desc}</div>
            </button>
          ))}
        </div>
      </Section>

      {/* SEAD FIRST */}
      <Section title="SEAD FIRST">
        <button
          onClick={() => setSeadFirst(!seadFirst)}
          style={{
            padding: '4px 10px',
            background: seadFirst ? 'var(--usa-secondary)' : 'transparent',
            border: `1px solid ${seadFirst ? 'var(--usa-primary)' : 'var(--border-default)'}`,
            borderRadius: 4,
            color: seadFirst ? 'var(--usa-primary)' : 'var(--text-muted)',
            cursor: 'pointer', fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)', fontWeight: 600,
          }}
        >
          {seadFirst ? 'SEAD ENABLED' : 'SEAD DISABLED'}
        </button>
      </Section>

      {/* WEAPON ALLOCATION */}
      <Section title="WEAPON ALLOCATION">
        {weaponsInRange.size === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 'var(--font-size-xs)' }}>
            No weapons in range of this cluster.
          </div>
        ) : (
          Array.from(weaponsInRange.entries()).map(([wId, info]) => {
            const allocForWeapon = allocations.filter((a) => a.weaponId === wId)
            const allocCount = allocForWeapon.reduce((s, a) => s + a.count, 0)
            return (
              <div key={wId} style={{ marginBottom: 6 }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  fontSize: 'var(--font-size-xs)', fontFamily: 'var(--font-mono)',
                }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {info.name}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {allocCount}/{info.count} from {info.launchers} unit{info.launchers !== 1 ? 's' : ''}
                  </span>
                </div>
                <StatBar
                  label=""
                  value={allocCount}
                  max={info.count}
                  color={allocCount > info.count * 0.8 ? 'var(--status-damaged)' : 'var(--text-accent)'}
                  showCount={false}
                />
              </div>
            )
          })
        )}
      </Section>

      {/* LAUNCHERS (expandable) */}
      <Section title="LAUNCHERS">
        {Array.from(launcherGroups.entries()).map(([unitId, allocs]) => {
          const fu = friendlyUnits.find((u) => u.id === unitId)
          const expanded = expandedLauncher === unitId
          return (
            <div key={unitId} style={{
              marginBottom: 4, background: 'var(--bg-hover)',
              borderRadius: 4, overflow: 'hidden',
            }}>
              <div
                onClick={() => setExpandedLauncher(expanded ? null : unitId)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 8px', cursor: 'pointer',
                }}
              >
                <span style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
                  {expanded ? 'v' : '>'} {allocs[0].unitName}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>
                  {allocs.reduce((s, a) => s + a.count, 0)} missiles
                </span>
              </div>

              {allocs.map((a) => (
                <div key={`${a.unitId}-${a.weaponId}`} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px 2px 20px',
                }}>
                  <span style={{ flex: 1, fontSize: '0.55rem', color: 'var(--text-secondary)' }}>
                    {weaponSpecs[a.weaponId]?.name ?? a.weaponId}
                  </span>
                  <div style={{
                    display: 'flex', alignItems: 'center',
                    background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)',
                    borderRadius: 3, overflow: 'hidden',
                  }}>
                    <QtyButton label="-" onClick={() => updateAllocation(a.unitId, a.weaponId, a.count - 1)} />
                    <span style={{
                      padding: '1px 4px', fontFamily: 'var(--font-mono)',
                      fontSize: '0.55rem', color: 'var(--text-primary)',
                      minWidth: 20, textAlign: 'center',
                    }}>
                      {a.count}
                    </span>
                    <QtyButton label="+" onClick={() => updateAllocation(a.unitId, a.weaponId, a.count + 1)} />
                  </div>
                </div>
              ))}

              {/* Expanded: full weapon inventory */}
              {expanded && fu && (
                <div style={{
                  padding: '4px 8px 4px 20px',
                  borderTop: '1px solid var(--border-default)',
                  fontSize: '0.55rem', color: 'var(--text-muted)',
                }}>
                  {fu.weapons.map((wl) => {
                    const spec = weaponSpecs[wl.weaponId]
                    return (
                      <div key={wl.weaponId} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                        <span>{spec?.name ?? wl.weaponId}</span>
                        <span>{wl.count}/{wl.maxCount}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </Section>

      {/* DISTRIBUTION */}
      <Section title="DISTRIBUTION">
        <div style={{ display: 'flex', gap: 4 }}>
          {DISTRIBUTION_OPTIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDistribution(d.value)}
              style={{
                flex: 1, padding: '3px 6px',
                background: distribution === d.value ? 'var(--bg-hover)' : 'transparent',
                border: `1px solid ${distribution === d.value ? 'var(--border-accent)' : 'var(--border-default)'}`,
                borderRadius: 4,
                color: distribution === d.value ? 'var(--text-accent)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem', fontWeight: 600,
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Execution state */}
      {executing ? (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <div style={{ color: 'var(--status-engaged)', fontWeight: 600, fontSize: 'var(--font-size-xs)' }}>
            EXECUTING... {Math.round(executionProgress * 100)}%
          </div>
          <div style={{ height: 4, background: 'var(--bg-hover)', borderRadius: 2, marginTop: 4 }}>
            <div style={{
              width: `${executionProgress * 100}%`, height: '100%',
              background: 'var(--status-engaged)', borderRadius: 2,
            }} />
          </div>
        </div>
      ) : (
        <button
          disabled={checkedTargets.length === 0 || totalMissiles === 0}
          onClick={handleLaunchStrike}
          style={{
            ...btnStyle,
            width: '100%', marginTop: 8,
            background: checkedTargets.length > 0 && totalMissiles > 0 ? 'var(--iran-secondary)' : 'var(--bg-hover)',
            color: '#fff', fontWeight: 700,
            opacity: checkedTargets.length > 0 && totalMissiles > 0 ? 1 : 0.4,
          }}
        >
          LAUNCH STRIKE ({totalMissiles} MISSILES)
        </button>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════
//  PLAN ATTACK TAB
// ════════════════════════════════════════════════════════════════

function PlanAttackTab() {
  const strike = useStrikeStore()
  const units = useGameStore((s) => s.viewState.units)
  const {
    planPriorities, planTiming, planName,
    computedPlan, executing, executionProgress,
  } = strike

  const [confirmExecute, setConfirmExecute] = useState(false)

  const friendlyUnits = useMemo(
    () => units.filter((u) => u.nation === 'usa' && u.status !== 'destroyed'),
    [units],
  )
  const enemyUnits = useMemo(
    () => units.filter((u) => u.nation !== 'usa' && u.status !== 'destroyed'),
    [units],
  )

  // Recompute plan whenever draft changes
  useEffect(() => {
    if (planPriorities.length === 0) {
      strike.setComputedPlan(null)
      return
    }
    const plan = computeAttackPlan(planPriorities, planTiming, friendlyUnits, enemyUnits, planName)
    strike.setComputedPlan(plan)
  }, [planPriorities, planTiming, planName, friendlyUnits, enemyUnits, strike])

  const handleAddPriority = useCallback((category: UnitCategory) => {
    strike.addPlanPriority({
      id: `p_${++priorityCounter}`,
      targetCategory: category,
      severity: 'standard',
      seadFirst: category !== 'sam_site',
      weaponPreference: 'any',
      launcherPreference: 'any',
    })
  }, [strike])

  const handleExecute = useCallback(async () => {
    if (!computedPlan || executing) return
    strike.startExecution()

    const strikes = computedPlan.strikes.filter((s) => s.inRange)
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
      if (ti > 0) {
        const delayMs = planTiming === 'staggered' ? 30_000 :
                        planTiming === 'sequential' ? 600_000 : 0
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, Math.min(delayMs / 100, 3000)))
        }
      }
      for (const stk of tierStrikes) {
        for (let i = 0; i < stk.count; i++) {
          await sendCommand({
            type: 'LAUNCH_MISSILE',
            launcherId: stk.launcherId,
            weaponId: stk.weaponId,
            targetId: stk.targetId,
          })
          fired++
          strike.updateProgress(fired / total)
        }
      }
    }

    strike.finishExecution()
    setConfirmExecute(false)
  }, [computedPlan, executing, planTiming, strike])

  const availableCategories = TARGET_CATEGORIES.filter(
    (tc) => !planPriorities.some((p) => p.targetCategory === tc.value),
  )

  return (
    <>
      {/* Target Priorities */}
      <Section title="TARGET PRIORITIES">
        {planPriorities.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 0', fontSize: 'var(--font-size-xs)' }}>
            No targets selected. Add priority tiers below.
          </div>
        )}
        {planPriorities.map((p, idx) => (
          <PriorityRow
            key={p.id}
            priority={p}
            index={idx}
            total={planPriorities.length}
            enemyCount={enemyUnits.filter((u) => u.category === p.targetCategory).length}
            onUpdate={(changes) => strike.updatePlanPriority(p.id, changes)}
            onRemove={() => strike.removePlanPriority(p.id)}
            onMoveUp={() => idx > 0 && strike.reorderPlanPriorities(idx, idx - 1)}
            onMoveDown={() => idx < planPriorities.length - 1 && strike.reorderPlanPriorities(idx, idx + 1)}
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
              {availableCategories.map((tc) => (
                <option key={tc.value} value={tc.value}>
                  {tc.label} ({enemyUnits.filter((u) => u.category === tc.value).length} targets)
                </option>
              ))}
            </select>
          </div>
        )}
      </Section>

      {/* Timing */}
      <Section title="TIMING">
        <div style={{ display: 'flex', gap: 4 }}>
          {TIMING_OPTIONS.map((t) => (
            <button
              key={t.value}
              onClick={() => strike.setPlanTiming(t.value)}
              style={{
                flex: 1, padding: '4px 6px',
                background: planTiming === t.value ? 'var(--bg-hover)' : 'transparent',
                border: `1px solid ${planTiming === t.value ? 'var(--border-accent)' : 'var(--border-default)'}`,
                borderRadius: 4,
                color: planTiming === t.value ? 'var(--text-accent)' : 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-mono)',
                fontSize: '0.6rem', fontWeight: 600, textAlign: 'center',
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
          onClick={() => { strike.reset(); strike.closeStrike() }}
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
              <div style={{
                width: `${executionProgress * 100}%`, height: '100%',
                background: 'var(--status-engaged)', borderRadius: 2,
              }} />
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
              ...btnStyle, flex: 2,
              background: confirmExecute ? '#cc2222' : 'var(--iran-secondary)',
              color: '#fff', fontWeight: 700,
              opacity: computedPlan && computedPlan.strikes.length > 0 ? 1 : 0.4,
            }}
          >
            {confirmExecute ? 'CONFIRM \u2014 AUTHORIZE STRIKE' : 'AUTHORIZE STRIKE'}
          </button>
        )}
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
//  Sub-components (shared)
// ════════════════════════════════════════════════════════════════

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        color: 'var(--text-muted)', fontSize: '0.6rem',
        textTransform: 'uppercase', letterSpacing: '0.05em',
        fontWeight: 600, marginBottom: 4,
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)',
      marginBottom: 4, textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      color: 'var(--text-muted)', fontStyle: 'italic',
      fontSize: 'var(--font-size-xs)', padding: '12px 0', textAlign: 'center',
    }}>
      {text}
    </div>
  )
}

function QtyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', color: 'var(--text-secondary)',
        cursor: 'pointer', fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-sm)', padding: '2px 6px', lineHeight: 1,
      }}
    >
      {label}
    </button>
  )
}

function SmallBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none', border: 'none',
        color: disabled ? 'var(--bg-hover)' : 'var(--text-muted)',
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
        padding: '0 3px', lineHeight: 1,
      }}
    >
      {label}
    </button>
  )
}

function PriorityRow({
  priority: p, index, total, enemyCount,
  onUpdate, onRemove, onMoveUp, onMoveDown,
}: {
  priority: AttackPriority
  index: number
  total: number
  enemyCount: number
  onUpdate: (changes: Partial<AttackPriority>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const label = TARGET_CATEGORIES.find((tc) => tc.value === p.targetCategory)?.label ?? p.targetCategory

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 6px', background: 'var(--bg-hover)',
      borderRadius: 4, marginBottom: 3, borderLeft: '3px solid var(--border-accent)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <SmallBtn label="^" onClick={onMoveUp} disabled={index === 0} />
        <SmallBtn label="v" onClick={onMoveDown} disabled={index === total - 1} />
      </div>

      <span style={{ color: 'var(--text-accent)', fontWeight: 700, fontSize: 'var(--font-size-xs)', minWidth: 16 }}>
        {index + 1}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>
          {enemyCount} target{enemyCount !== 1 ? 's' : ''}
        </div>
      </div>

      <select
        value={p.severity}
        onChange={(e) => onUpdate({ severity: e.target.value as Severity })}
        style={{ ...selectStyle, width: 100, fontSize: '0.6rem' }}
      >
        {SEVERITY_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <button
        onClick={() => onUpdate({ seadFirst: !p.seadFirst })}
        style={{
          padding: '2px 6px',
          background: p.seadFirst ? 'var(--usa-secondary)' : 'transparent',
          border: `1px solid ${p.seadFirst ? 'var(--usa-primary)' : 'var(--border-default)'}`,
          borderRadius: 3,
          color: p.seadFirst ? 'var(--usa-primary)' : 'var(--text-muted)',
          cursor: 'pointer', fontFamily: 'var(--font-mono)',
          fontSize: '0.55rem', fontWeight: 600,
        }}
        title="Suppress Enemy Air Defenses first"
      >
        SEAD
      </button>

      <SmallBtn label="x" onClick={onRemove} />
    </div>
  )
}

function PlanPreview({ plan }: { plan: AttackPlan }) {
  const tiers = new Map<number, PlannedStrike[]>()
  for (const s of plan.strikes) {
    const group = tiers.get(s.priorityTier) ?? []
    group.push(s)
    tiers.set(s.priorityTier, group)
  }
  const sortedTiers = Array.from(tiers.entries()).sort(([a], [b]) => a - b)

  if (sortedTiers.length === 0) {
    return (
      <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 'var(--font-size-xs)' }}>
        No strikes allocated — check priorities and weapon availability.
      </div>
    )
  }

  return (
    <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.6rem' }}>
      {sortedTiers.map(([tier, strikes]) => {
        const firstStrike = strikes[0]
        const tierLabel = firstStrike?.targetCategory === 'sam_site' ? 'SEAD' :
          TARGET_CATEGORIES.find((tc) => tc.value === firstStrike?.targetCategory)?.label?.toUpperCase() ?? `TIER ${tier + 1}`

        return (
          <div key={tier} style={{ marginBottom: 6 }}>
            <div style={{ color: 'var(--text-accent)', fontWeight: 700, marginBottom: 2 }}>
              TIER {tier + 1} — {tierLabel}
            </div>
            {strikes.map((s, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between',
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

function PlanSummary({ plan }: { plan: AttackPlan }) {
  const { summary } = plan

  return (
    <div style={{ fontSize: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span>Total Missiles: <b style={{ color: 'var(--text-accent)' }}>{summary.totalMissiles}</b></span>
        <span>Targets: <b style={{ color: 'var(--text-accent)' }}>{summary.totalTargets}</b></span>
        <span>Est. Kills: <b style={{ color: 'var(--status-ready)' }}>{summary.estimatedKills}</b></span>
      </div>

      {Object.entries(summary.weaponBudget).map(([name, budget]) => {
        const pct = budget.available > 0 ? budget.needed / budget.available : 1
        return (
          <StatBar
            key={name}
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

// ════════════════════════════════════════════════════════════════
//  Shared styles
// ════════════════════════════════════════════════════════════════

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

const clearBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
}
