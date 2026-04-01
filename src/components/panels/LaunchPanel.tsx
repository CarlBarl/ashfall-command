import { useMemo, useState } from 'react'
import Panel from '@/components/common/Panel'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { ViewUnit } from '@/types/view'

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

export default function LaunchPanel() {
  const selectedUnitIds = useUIStore((s) => s.selectedUnitIds)
  const targetId = useUIStore((s) => s.targetUnitId)
  const targetingMode = useUIStore((s) => s.targetingMode)
  const enterTargetingMode = useUIStore((s) => s.enterTargetingMode)
  const exitTargetingMode = useUIStore((s) => s.exitTargetingMode)
  const setTarget = useUIStore((s) => s.setTarget)
  const togglePanel = useUIStore((s) => s.togglePanel)

  const units = useGameStore((s) => s.viewState.units)
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  // Get all selected units
  const selectedUnits = useMemo(
    () => units.filter(u => selectedUnitIds.has(u.id)),
    [units, selectedUnitIds],
  )
  const unitCount = selectedUnits.length

  if (unitCount === 0) return null

  const weapons = aggregateWeapons(selectedUnits)
  if (weapons.length === 0) return null

  const target = units.find(u => u.id === targetId)
  const firstUnit = selectedUnits[0]
  const enemies = units.filter(u => u.nation !== firstUnit.nation && u.status !== 'destroyed')

  const getQty = (weaponId: string, maxCount: number) => {
    const q = quantities[weaponId] ?? unitCount
    return Math.min(q, maxCount)
  }

  const setQty = (weaponId: string, val: number) => {
    setQuantities(prev => ({ ...prev, [weaponId]: Math.max(1, val) }))
  }

  /** Distribute N missiles across launchers that have this weapon, round-robin */
  const fireSalvo = (weaponId: string, totalCount: number) => {
    if (!targetId) return
    const agg = weapons.find(w => w.weaponId === weaponId)
    if (!agg) return

    // Copy launcher counts so we can decrement locally
    const available = agg.launchers.map(l => ({ ...l }))
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
          targetId,
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

  const title = unitCount > 1 ? `LAUNCH CONTROL (${unitCount} UNITS)` : 'LAUNCH CONTROL'

  return (
    <Panel
      title={title}
      style={{ position: 'absolute', bottom: 12, right: 12, width: 320 }}
    >
      {/* Multi-unit indicator */}
      {unitCount > 1 && (
        <div style={{
          fontSize: '0.55rem',
          color: 'var(--text-muted)',
          marginBottom: 6,
          fontStyle: 'italic',
        }}>
          Weapons aggregated from {unitCount} units. Fire distributes evenly.
        </div>
      )}

      {/* Target selection */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginBottom: 4, textTransform: 'uppercase' }}>
          Target
        </div>

        {target && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 8px',
            background: 'rgba(204, 68, 68, 0.15)',
            border: '1px solid var(--iran-secondary)',
            borderRadius: 4,
            marginBottom: 6,
          }}>
            <span style={{ color: 'var(--iran-primary)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
              {target.name}
            </span>
            <button
              onClick={() => setTarget(null)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)',
              }}
            >
              clear
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={targetingMode ? exitTargetingMode : enterTargetingMode}
            style={{
              flex: 1,
              padding: '5px 8px',
              background: targetingMode ? 'var(--iran-primary)' : 'var(--bg-hover)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              color: targetingMode ? '#fff' : 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
            }}
          >
            {targetingMode ? 'CLICK ENEMY ON MAP...' : 'SELECT ON MAP'}
          </button>
        </div>

        <select
          value={targetId ?? ''}
          onChange={(e) => setTarget(e.target.value || null)}
          style={{
            width: '100%',
            marginTop: 4,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            padding: '4px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
          }}
        >
          <option value="">-- or pick from list --</option>
          {enemies.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.category.replace(/_/g, ' ')}) {t.health < 100 ? `[${t.health}%]` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Weapons with quantity — aggregated across all selected units */}
      {weapons.map((w) => {
        const qty = getQty(w.weaponId, w.totalCount)
        const step = unitCount // +/- steps by number of units
        return (
          <div key={w.weaponId} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginBottom: 5,
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              overflow: 'hidden',
              flexShrink: 0,
            }}>
              <QtyButton label="-" onClick={() => setQty(w.weaponId, qty - step)} />
              <span style={{
                padding: '2px 6px',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-primary)',
                minWidth: 28,
                textAlign: 'center',
              }}>
                {qty}
              </span>
              <QtyButton label="+" onClick={() => setQty(w.weaponId, Math.min(qty + step, w.totalCount))} />
            </div>

            <button
              disabled={!targetId || w.totalCount <= 0}
              onClick={() => fireSalvo(w.weaponId, qty)}
              style={{
                flex: 1,
                display: 'flex',
                justifyContent: 'space-between',
                padding: '5px 8px',
                background: targetId ? 'var(--iran-secondary)' : 'var(--bg-hover)',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                cursor: targetId ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
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
      {targetId && weapons.length > 0 && (
        <div style={{ marginTop: 6, borderTop: '1px solid var(--border-default)', paddingTop: 6 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginBottom: 4, textTransform: 'uppercase' }}>
            Quick Salvo
          </div>
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
                    flex: 1,
                    padding: '4px',
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 4,
                    color: actual < n ? 'var(--text-muted)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
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

      {/* Plan Attack button — opens presidential attack planner */}
      {unitCount >= 1 && (
        <div style={{ marginTop: 6, borderTop: '1px solid var(--border-default)', paddingTop: 6 }}>
          <button
            onClick={() => togglePanel('attackPlan')}
            style={{
              width: '100%',
              padding: '6px 8px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-accent)',
              borderRadius: 4,
              color: 'var(--text-accent)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            PLAN COORDINATED ATTACK
          </button>
        </div>
      )}
    </Panel>
  )
}

function QtyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-sm)',
        padding: '2px 6px',
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  )
}
