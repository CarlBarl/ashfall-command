import { useCallback, useEffect, useMemo, useState } from 'react'
import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useStrikeStore, type StrikeMode } from '@/store/strike-store'
import { useGameStore } from '@/store/game-store'
import { useIntelStore } from '@/store/intel-store'
import { sendCommand } from '@/store/bridge'
import { weaponSpecs } from '@/data/weapons/missiles'
import { computeAttackPlan } from '@/engine/attack-planner'
import { computeRouteDistance } from '@/components/map/layers/RouteLayer'
import { getMainThreadGrid } from '@/components/map/layers/LOSLayer'
import { findAutoRoute } from '@/engine/systems/route-planner'
import { haversine } from '@/engine/utils/geo'
import type { UnitCategory } from '@/types/game'
import type { AttackPriority, Severity, TimingMode, PlannedStrike, AttackPlan } from '@/types/attack-plan'

// ════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════

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

// ════════════════════════════════════════════════════════════════
//  StrikePanel — unified component
// ════════════════════════════════════════════════════════════════

export default function StrikePanel() {
  const strike = useStrikeStore()

  const { mode, open, targetUnitId } = strike

  // Visibility: show when explicitly opened OR when a target is set (auto-show direct fire)
  const autoShowDirect = mode === 'direct' && targetUnitId !== null
  if (!open && !autoShowDirect) return null

  // Title per mode
  const title =
    mode === 'plan'
      ? 'PRESIDENTIAL STRIKE AUTHORIZATION'
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
  const units = useGameStore((s) => s.viewState.units)
  const playerNation = useGameStore((s) => s.viewState.playerNation)
  const targetUnitId = useStrikeStore((s) => s.targetUnitId)
  const targetingMode = useStrikeStore((s) => s.targetingMode)
  const setTargetUnitId = useStrikeStore((s) => s.setTargetUnitId)
  const setTargetingMode = useStrikeStore((s) => s.setTargetingMode)
  const strikeClusterUnits = useStrikeStore((s) => s.strikeClusterUnits)
  const setStrikeCluster = useStrikeStore((s) => s.setStrikeCluster)
  const routingMode = useStrikeStore((s) => s.routingMode)
  const routeWaypoints = useStrikeStore((s) => s.routeWaypoints)
  const setRoutingMode = useStrikeStore((s) => s.setRoutingMode)
  const removeRouteWaypoint = useStrikeStore((s) => s.removeRouteWaypoint)
  const clearRouteWaypoints = useStrikeStore((s) => s.clearRouteWaypoints)
  const estimatedUnits = useIntelStore((s) => s.estimatedUnits)

  const [selectedLauncherId, setSelectedLauncherId] = useState<string | null>(null)
  const [selectedRouteWeaponId, setSelectedRouteWeaponId] = useState<string | null>(null)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [clusterQty, setClusterQty] = useState<Record<string, number>>({})
  const [autoRouteStatus, setAutoRouteStatus] = useState<string | null>(null)

  const target = units.find((u) => u.id === targetUnitId)

  // Cluster mode: resolve targets from IDs
  const clusterTargets = useMemo(
    () => strikeClusterUnits.map(ct => units.find(u => u.id === ct.id)).filter(Boolean),
    [strikeClusterUnits, units],
  )
  const isClusterMode = clusterTargets.length > 1
  const enemies = useMemo(
    () => units.filter((u) => u.nation !== playerNation && u.status !== 'destroyed'),
    [units, playerNation],
  )

  // Units in range of target (or first cluster target), sorted by distance
  const rangeRef = isClusterMode ? clusterTargets[0] : target
  const unitsInRange = useMemo(() => {
    if (!rangeRef) return []
    return units
      .filter((u) => u.nation === playerNation && u.status !== 'destroyed' &&
        u.weapons.some(w => {
          const spec = weaponSpecs[w.weaponId]
          return spec && spec.type !== 'sam' && w.count > 0 &&
                 haversine(u.position, rangeRef.position) <= spec.range_km
        }),
      )
      .map(u => ({ ...u, distance: Math.round(haversine(u.position, rangeRef.position)) }))
      .sort((a, b) => a.distance - b.distance)
  }, [units, rangeRef, playerNation])

  const activeLauncherId = selectedLauncherId ?? unitsInRange[0]?.id ?? null
  const launcher = unitsInRange.find(u => u.id === activeLauncherId)
  const launcherWeapons = useMemo(() => {
    if (!launcher || !target) return []
    return launcher.weapons
      .filter(w => {
        const spec = weaponSpecs[w.weaponId]
        return spec && spec.type !== 'sam' && w.count > 0 &&
               haversine(launcher.position, target.position) <= spec.range_km
      })
      .map(w => ({
        weaponId: w.weaponId,
        name: weaponSpecs[w.weaponId]?.name ?? w.weaponId,
        count: w.count,
        maxCount: w.maxCount,
      }))
  }, [launcher, target])

  const getQty = (key: string, max: number) => Math.min(quantities[key] ?? 1, max)
  const setQty = (key: string, val: number) => setQuantities(prev => ({ ...prev, [key]: Math.max(1, val) }))
  const [directFire, setDirectFire] = useState(false)

  const fire = async (weaponId: string, count: number) => {
    if (!targetUnitId || !activeLauncherId || count <= 0) return

    let waypoints: import('@/types/game').Position[] | undefined

    // Auto-route by default (unless direct fire toggled)
    if (!directFire && launcher && target) {
      const grid = getMainThreadGrid()
      const spec = weaponSpecs[weaponId]
      if (grid && spec && spec.type !== 'sam') {
        // Collect enemy radars for threat avoidance
        const threats = units
          .filter(u => u.nation !== playerNation && u.status !== 'destroyed')
          .flatMap(u => (u.sensors ?? [])
            .filter(s => s.type === 'radar')
            .map(s => ({ position: u.position, range_km: s.range_km })))

        const route = findAutoRoute(
          launcher.position, target.position,
          threats, grid, spec.range_km,
        )
        if (route && route.length > 0) {
          waypoints = route
        }
      }
    }

    await sendCommand({
      type: 'LAUNCH_SALVO',
      launcherId: activeLauncherId,
      weaponId,
      targetId: targetUnitId,
      count,
      waypoints,
    })
  }

  // Cluster fire handler — distributes missiles evenly across cluster targets
  const fireCluster = async () => {
    if (!activeLauncherId || clusterTargets.length === 0) return
    for (const ct of clusterTargets) {
      if (!ct) continue
      const qty = clusterQty[ct.id] ?? 1
      // Find first offensive weapon on launcher that can reach this target
      const launcher = unitsInRange.find(u => u.id === activeLauncherId)
      if (!launcher) continue
      const wpn = launcher.weapons.find(w => {
        const spec = weaponSpecs[w.weaponId]
        return spec && spec.type !== 'sam' && w.count > 0 &&
               haversine(launcher.position, ct.position) <= spec.range_km
      })
      if (wpn && qty > 0) {
        await sendCommand({ type: 'LAUNCH_SALVO', launcherId: activeLauncherId, weaponId: wpn.weaponId, targetId: ct.id, count: qty })
      }
    }
  }

  // Cluster mode UI
  if (isClusterMode) {
    return (
      <>
        <SectionLabel>Cluster Strike — {clusterTargets.length} targets</SectionLabel>
        <button
          onClick={() => setStrikeCluster([])}
          style={{ ...clearBtnStyle, marginBottom: 6 }}
        >clear cluster</button>

        {/* Target list with per-target qty */}
        {clusterTargets.map(ct => {
          if (!ct) return null
          const qty = clusterQty[ct.id] ?? 1
          return (
            <div key={ct.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
                borderRadius: 4, overflow: 'hidden', flexShrink: 0,
              }}>
                <QtyButton label="-" onClick={() => setClusterQty(prev => ({ ...prev, [ct.id]: Math.max(1, qty - 1) }))} />
                <span style={{ padding: '2px 5px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)', minWidth: 24, textAlign: 'center' }}>{qty}</span>
                <QtyButton label="+" onClick={() => setClusterQty(prev => ({ ...prev, [ct.id]: qty + 1 }))} />
              </div>
              <span style={{ flex: 1, color: 'var(--iran-primary)', fontSize: 'var(--font-size-xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ct.name}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>{ct.health}%</span>
            </div>
          )
        })}

        {/* Launcher dropdown */}
        {unitsInRange.length > 0 && (
          <>
            <SectionLabel>Fire from</SectionLabel>
            <select
              value={activeLauncherId ?? ''}
              onChange={(e) => setSelectedLauncherId(e.target.value || null)}
              style={{ ...selectStyle, marginBottom: 6 }}
            >
              {unitsInRange.map(u => (
                <option key={u.id} value={u.id}>{u.name} — {u.distance}km</option>
              ))}
            </select>

            <button
              onClick={fireCluster}
              disabled={!activeLauncherId}
              style={{
                width: '100%', padding: '6px',
                background: 'var(--iran-primary)', border: '1px solid var(--iran-primary)',
                borderRadius: 4, color: '#fff', cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', fontWeight: 700,
                opacity: activeLauncherId ? 1 : 0.5,
              }}
            >
              FIRE {clusterTargets.reduce((s, ct) => s + (clusterQty[ct!.id] ?? 1), 0)} MISSILES
            </button>
          </>
        )}

        {unitsInRange.length === 0 && <EmptyState text="No launchers in range of cluster." />}
      </>
    )
  }

  return (
    <>
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
            <button onClick={() => setTargetUnitId(null)} style={clearBtnStyle}>clear</button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setTargetingMode(!targetingMode)}
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
          onChange={(e) => setTargetUnitId(e.target.value || null)}
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

      {!target && <EmptyState text="Click an enemy unit to fire." />}

      {/* Launcher dropdown — nearest units first */}
      {target && unitsInRange.length === 0 && (
        <EmptyState text="No launchers in range of this target." />
      )}

      {target && unitsInRange.length > 0 && (
        <>
          <SectionLabel>Fire from</SectionLabel>
          <select
            value={activeLauncherId ?? ''}
            onChange={(e) => setSelectedLauncherId(e.target.value || null)}
            style={{ ...selectStyle, marginBottom: 8 }}
          >
            {unitsInRange.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} — {u.distance}km
              </option>
            ))}
          </select>

          {/* Route mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <button
              onClick={() => setDirectFire(!directFire)}
              style={{
                padding: '2px 8px',
                background: directFire ? 'var(--status-damaged)' : 'var(--status-ready)',
                border: '1px solid var(--border-default)',
                borderRadius: 3,
                color: '#fff',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.55rem',
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.08em',
              }}
            >
              {directFire ? 'DIRECT' : 'AUTO-ROUTE'}
            </button>
            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)' }}>
              {directFire ? 'Straight line — no radar avoidance' : 'Avoids enemy radar coverage'}
            </span>
          </div>

          {/* Selected launcher's weapons */}
          {launcherWeapons.map((w) => {
            const qty = getQty(w.weaponId, w.count)
            return (
              <div key={w.weaponId} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <div style={{
                  display: 'flex', alignItems: 'center',
                  background: 'var(--bg-hover)', border: '1px solid var(--border-default)',
                  borderRadius: 4, overflow: 'hidden', flexShrink: 0,
                }}>
                  <QtyButton label="-" onClick={() => setQty(w.weaponId, qty - 1)} />
                  <span style={{
                    padding: '2px 5px', fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)',
                    minWidth: 24, textAlign: 'center',
                  }}>
                    {qty}
                  </span>
                  <QtyButton label="+" onClick={() => setQty(w.weaponId, Math.min(qty + 1, w.count))} />
                </div>

                <button
                  onClick={() => fire(w.weaponId, qty)}
                  style={{
                    flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '4px 8px',
                    background: 'var(--iran-secondary)',
                    border: '1px solid var(--border-default)', borderRadius: 4,
                    color: 'var(--text-primary)', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                  }}
                >
                  <span>{w.name}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                    {w.count}/{w.maxCount}
                  </span>
                </button>
              </div>
            )
          })}

          {/* PLAN ROUTE button — only for cruise missiles / loitering munitions */}
          {(() => {
            const routableWeapons = launcherWeapons.filter(w => {
              const spec = weaponSpecs[w.weaponId]
              return spec && (spec.type === 'cruise_missile' || spec.type === 'loitering_munition')
            })
            if (routableWeapons.length === 0) return null

            if (!routingMode) {
              return (
                <button
                  onClick={() => {
                    setRoutingMode(true)
                    setSelectedRouteWeaponId(routableWeapons[0].weaponId)
                  }}
                  style={{
                    width: '100%', padding: '5px 8px', marginTop: 6,
                    background: 'transparent',
                    border: '1px dashed var(--border-accent)', borderRadius: 4,
                    color: 'var(--text-accent)', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                  }}
                >
                  PLAN ROUTE
                </button>
              )
            }

            // Routing mode active — show route planner
            const activeRouteWeapon = selectedRouteWeaponId ?? routableWeapons[0].weaponId
            const routeSpec = weaponSpecs[activeRouteWeapon]
            const routeDist = launcher && target
              ? Math.round(computeRouteDistance(launcher.position, routeWaypoints, target.position))
              : 0
            const maxRange = routeSpec?.range_km ?? 0
            const remaining = maxRange - routeDist
            const rangeColor = remaining < 0
              ? 'var(--status-damaged)'
              : remaining < maxRange * 0.2
                ? 'var(--status-engaged)'
                : 'var(--status-ready)'

            // Collect enemy radars from both detected units and intel estimates
            const enemyRadarUnits = units
              .filter(u => u.nation !== playerNation && u.status !== 'destroyed')
              .flatMap(u => (u.sensors ?? [])
                .filter(s => s.type === 'radar')
                .map(s => ({ position: u.position, range_km: s.range_km })))
            const intelRadars = estimatedUnits
              .flatMap(u => u.sensors
                .filter(s => s.type === 'radar')
                .map(s => ({ position: u.position, range_km: s.range_km })))
            const allRadars = [...enemyRadarUnits, ...intelRadars]

            // Count exposed segments
            const allPoints = launcher && target
              ? [launcher.position, ...routeWaypoints, target.position]
              : []
            let exposedCount = 0
            for (let i = 0; i < allPoints.length - 1; i++) {
              const from = allPoints[i]
              const to = allPoints[i + 1]
              const midPos = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 }
              if (allRadars.some(r => haversine(midPos, r.position) <= r.range_km)) {
                exposedCount++
              }
            }
            const totalSegments = Math.max(allPoints.length - 1, 1)

            const fireWithRoute = async () => {
              if (!targetUnitId || !activeLauncherId || remaining < 0) return
              await sendCommand({
                type: 'LAUNCH_MISSILE',
                launcherId: activeLauncherId,
                weaponId: activeRouteWeapon,
                targetId: targetUnitId,
                waypoints: routeWaypoints,
              })
              setRoutingMode(false)
            }

            return (
              <div style={{
                marginTop: 8, padding: '8px',
                border: '1px solid var(--border-accent)',
                borderRadius: 4, background: 'rgba(68, 136, 204, 0.08)',
              }}>
                <SectionLabel>Route Planner</SectionLabel>

                {/* Weapon selector for route */}
                {routableWeapons.length > 1 && (
                  <select
                    value={activeRouteWeapon}
                    onChange={(e) => setSelectedRouteWeaponId(e.target.value)}
                    style={{ ...selectStyle, marginBottom: 6 }}
                  >
                    {routableWeapons.map(w => (
                      <option key={w.weaponId} value={w.weaponId}>
                        {w.name} ({w.count}/{w.maxCount})
                      </option>
                    ))}
                  </select>
                )}
                {routableWeapons.length === 1 && (
                  <div style={{
                    fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)',
                    marginBottom: 6, fontWeight: 600,
                  }}>
                    {routableWeapons[0].name}
                  </div>
                )}

                {/* Instructions */}
                <div style={{
                  fontSize: '0.55rem', color: 'var(--text-muted)',
                  marginBottom: 6, fontStyle: 'italic',
                }}>
                  Click on the map to add waypoints, or use AUTO-ROUTE for A* pathfinding.
                </div>

                {/* Auto-route button */}
                <button
                  onClick={() => {
                    if (!launcher || !target) return
                    const grid = getMainThreadGrid()
                    if (!grid) {
                      setAutoRouteStatus('Elevation grid not loaded')
                      return
                    }
                    setAutoRouteStatus('Computing...')
                    // Run in a microtask to allow UI to update
                    Promise.resolve().then(() => {
                      const route = findAutoRoute(
                        launcher.position,
                        target.position,
                        allRadars,
                        grid,
                        maxRange,
                      )
                      if (route === null) {
                        setAutoRouteStatus('No route found (out of range or blocked)')
                      } else {
                        // Set waypoints in store: clear, then add each
                        clearRouteWaypoints()
                        for (const wp of route) {
                          useStrikeStore.getState().addRouteWaypoint(wp)
                        }
                        setAutoRouteStatus(
                          route.length === 0
                            ? 'Direct route is optimal (no waypoints needed)'
                            : `Route found: ${route.length} waypoints`,
                        )
                      }
                    })
                  }}
                  style={{
                    width: '100%', padding: '5px 8px', marginBottom: 6,
                    background: 'transparent',
                    border: '1px dashed var(--usa-accent, #4488cc)', borderRadius: 4,
                    color: 'var(--usa-accent, #4488cc)', cursor: 'pointer',
                    fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                  }}
                >
                  AUTO-ROUTE (A* PATHFINDER)
                </button>
                {autoRouteStatus && (
                  <div style={{
                    fontSize: '0.55rem', marginBottom: 6, fontStyle: 'italic',
                    color: autoRouteStatus.startsWith('No route')
                      ? 'var(--status-damaged)'
                      : autoRouteStatus === 'Computing...'
                        ? 'var(--text-muted)'
                        : 'var(--status-ready)',
                  }}>
                    {autoRouteStatus}
                  </div>
                )}

                {/* Waypoint list */}
                {routeWaypoints.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    {routeWaypoints.map((wp, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '2px 4px', fontSize: '0.55rem',
                        borderBottom: '1px solid var(--border-default)',
                      }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          WP{i + 1}: {wp.lat.toFixed(2)}N {wp.lng.toFixed(2)}E
                        </span>
                        <button
                          onClick={() => removeRouteWaypoint(i)}
                          style={{
                            background: 'none', border: 'none',
                            color: 'var(--status-damaged)', cursor: 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: '0.6rem',
                            padding: '0 4px',
                          }}
                        >
                          X
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Fuel / range display */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 4, fontSize: 'var(--font-size-xs)',
                }}>
                  <span style={{ color: 'var(--text-muted)' }}>Range:</span>
                  <span style={{ color: rangeColor, fontWeight: 700 }}>
                    {routeDist} / {maxRange} km
                  </span>
                </div>
                {remaining >= 0 && (
                  <div style={{
                    height: 4, background: 'var(--bg-hover)', borderRadius: 2, marginBottom: 6,
                  }}>
                    <div style={{
                      width: `${Math.min((routeDist / maxRange) * 100, 100)}%`,
                      height: '100%', background: rangeColor, borderRadius: 2,
                    }} />
                  </div>
                )}
                {remaining < 0 && (
                  <div style={{
                    color: 'var(--status-damaged)', fontSize: '0.55rem', marginBottom: 6,
                  }}>
                    Route exceeds weapon range by {Math.abs(remaining)} km
                  </div>
                )}

                {/* Threat exposure summary */}
                <div style={{
                  fontSize: '0.55rem', color: 'var(--text-muted)', marginBottom: 6,
                }}>
                  Threat exposure: <span style={{
                    color: exposedCount === 0
                      ? 'var(--status-ready)'
                      : exposedCount < totalSegments
                        ? 'var(--status-engaged)'
                        : 'var(--status-damaged)',
                    fontWeight: 600,
                  }}>
                    {exposedCount}/{totalSegments} segments exposed
                  </span>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setRoutingMode(false)}
                    style={{ ...btnStyle, flex: 1, fontSize: '0.55rem', padding: '4px 6px', color: 'var(--text-muted)' }}
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={clearRouteWaypoints}
                    style={{ ...btnStyle, flex: 1, fontSize: '0.55rem', padding: '4px 6px' }}
                  >
                    CLEAR
                  </button>
                  <button
                    onClick={fireWithRoute}
                    disabled={remaining < 0}
                    style={{
                      ...btnStyle, flex: 2, fontSize: '0.55rem', padding: '4px 6px',
                      background: remaining >= 0 ? 'var(--iran-primary)' : 'var(--bg-hover)',
                      color: remaining >= 0 ? '#fff' : 'var(--text-muted)',
                      fontWeight: 700,
                      opacity: remaining >= 0 ? 1 : 0.5,
                    }}
                  >
                    CONFIRM ROUTE
                  </button>
                </div>
              </div>
            )
          })()}
        </>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════
//  PLAN ATTACK TAB
// ════════════════════════════════════════════════════════════════

function PlanAttackTab() {
  const strike = useStrikeStore()
  const setComputedPlan = useStrikeStore((s) => s.setComputedPlan)
  const units = useGameStore((s) => s.viewState.units)
  const playerNation = useGameStore((s) => s.viewState.playerNation)
  const {
    planPriorities, planTiming, planName,
    computedPlan, executing, executionProgress,
  } = strike

  const friendlyUnits = useMemo(
    () => units.filter((u) => u.nation === playerNation && u.status !== 'destroyed'),
    [units, playerNation],
  )
  const enemyUnits = useMemo(
    () => units.filter((u) => u.nation !== playerNation && u.status !== 'destroyed'),
    [units, playerNation],
  )

  // Recompute plan whenever draft changes
  useEffect(() => {
    if (planPriorities.length === 0) {
      setComputedPlan(null)
      return
    }
    const plan = computeAttackPlan(planPriorities, planTiming, friendlyUnits, enemyUnits, planName)
    setComputedPlan(plan)
  }, [planPriorities, planTiming, planName, friendlyUnits, enemyUnits, setComputedPlan])

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
        await sendCommand({
          type: 'LAUNCH_SALVO',
          launcherId: stk.launcherId,
          weaponId: stk.weaponId,
          targetId: stk.targetId,
          count: stk.count,
        })
        fired += stk.count
        strike.updateProgress(fired / total)
      }
    }

    strike.finishExecution()
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
            onClick={handleExecute}
            style={{
              ...btnStyle, flex: 2,
              background: 'var(--iran-secondary)',
              color: '#fff', fontWeight: 700,
              opacity: computedPlan && computedPlan.strikes.length > 0 ? 1 : 0.4,
            }}
          >
            AUTHORIZE STRIKE
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
