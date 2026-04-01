import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useUIStore } from '@/store/ui-store'
import type { ViewUnit } from '@/types/view'
import { weaponSpecs } from '@/data/weapons/missiles'

interface UnitInfoPanelProps {
  units: ViewUnit[]
}

const STATUS_COLORS: Record<string, string> = {
  ready: 'var(--status-ready)',
  engaged: 'var(--status-engaged)',
  moving: 'var(--status-moving)',
  damaged: 'var(--status-damaged)',
  destroyed: 'var(--status-destroyed)',
  reloading: 'var(--text-secondary)',
}

export default function UnitInfoPanel({ units }: UnitInfoPanelProps) {
  const selectedId = useUIStore((s) => s.selectedUnitId)
  const selectUnit = useUIStore((s) => s.selectUnit)

  const unit = units.find((u) => u.id === selectedId)
  if (!unit) return null

  return (
    <Panel
      title={unit.name}
      onClose={() => selectUnit(null)}
      style={{ position: 'absolute', top: 60, right: 12 }}
    >
      {/* Status + Health */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{
            color: STATUS_COLORS[unit.status] ?? 'var(--text-secondary)',
            textTransform: 'uppercase',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
          }}>
            {unit.status}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
            {unit.nation.toUpperCase()} / {unit.category.replace(/_/g, ' ')}
          </span>
        </div>
        <StatBar label="HEALTH" value={unit.health} max={100} color={healthColor(unit.health)} />
      </div>

      {/* Position */}
      <Row label="POSITION" value={`${unit.position.lat.toFixed(2)}N, ${unit.position.lng.toFixed(2)}E`} />
      {unit.speed_kts > 0 && <Row label="SPEED" value={`${unit.speed_kts} kts`} />}
      <Row label="ROE" value={unit.roe.replace(/_/g, ' ').toUpperCase()} />

      {/* Weapons */}
      {unit.weapons.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}>
            Armament
          </div>
          {unit.weapons.map((w) => {
            const spec = weaponSpecs[w.weaponId]
            const name = spec?.name ?? w.weaponId
            const depleted = w.count === 0
            return (
              <StatBar
                key={w.weaponId}
                label={name}
                value={w.count}
                max={w.maxCount}
                color={depleted ? 'var(--status-damaged)' : 'var(--text-accent)'}
              />
            )
          })}
        </div>
      )}
    </Panel>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      padding: '2px 0',
      fontSize: 'var(--font-size-xs)',
    }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function healthColor(hp: number): string {
  if (hp > 70) return 'var(--status-ready)'
  if (hp > 30) return 'var(--status-engaged)'
  return 'var(--status-damaged)'
}
