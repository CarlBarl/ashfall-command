import { useState } from 'react'
import Panel from '@/components/common/Panel'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import { weaponSpecs } from '@/data/weapons/missiles'

export default function LaunchPanel() {
  const selectedId = useUIStore((s) => s.selectedUnitId)
  const units = useGameStore((s) => s.viewState.units)
  const [targetId, setTargetId] = useState<string | null>(null)

  const unit = units.find((u) => u.id === selectedId)
  if (!unit) return null

  // Only show for units with offensive weapons
  const offensiveWeapons = unit.weapons.filter(w => {
    const spec = weaponSpecs[w.weaponId]
    return spec && spec.type !== 'sam' && w.count > 0
  })

  if (offensiveWeapons.length === 0) return null

  // Get enemy units as potential targets
  const enemies = units.filter(u => u.nation !== unit.nation && u.status !== 'destroyed')

  return (
    <Panel
      title="LAUNCH CONTROL"
      style={{ position: 'absolute', bottom: 12, right: 12, width: 300 }}
    >
      {/* Target selection */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', display: 'block', marginBottom: 4 }}>
          TARGET
        </label>
        <select
          value={targetId ?? ''}
          onChange={(e) => setTargetId(e.target.value || null)}
          style={{
            width: '100%',
            background: 'var(--bg-hover)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            padding: '4px 6px',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
          }}
        >
          <option value="">-- Select Target --</option>
          {enemies.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.category.replace(/_/g, ' ')})
            </option>
          ))}
        </select>
      </div>

      {/* Weapon buttons */}
      {offensiveWeapons.map((w) => {
        const spec = weaponSpecs[w.weaponId]
        if (!spec) return null
        return (
          <button
            key={w.weaponId}
            disabled={!targetId || w.count <= 0}
            onClick={() => {
              if (!targetId) return
              sendCommand({
                type: 'LAUNCH_MISSILE',
                launcherId: unit.id,
                weaponId: w.weaponId,
                targetId,
              })
            }}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              width: '100%',
              padding: '6px 8px',
              marginBottom: 4,
              background: targetId ? 'var(--iran-secondary)' : 'var(--bg-hover)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              cursor: targetId ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              opacity: w.count > 0 ? 1 : 0.4,
            }}
          >
            <span>FIRE {spec.name}</span>
            <span style={{ color: 'var(--text-muted)' }}>{w.count}/{w.maxCount}</span>
          </button>
        )
      })}
    </Panel>
  )
}
