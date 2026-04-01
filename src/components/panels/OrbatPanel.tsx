import { useState } from 'react'
import Panel from '@/components/common/Panel'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import type { NationId, UnitCategory } from '@/types/game'
import type { ViewUnit } from '@/types/view'

const CATEGORY_LABELS: Record<UnitCategory, string> = {
  airbase: 'Airbases',
  naval_base: 'Naval Bases',
  sam_site: 'SAM Sites',
  missile_battery: 'Missile Batteries',
  aircraft: 'Aircraft',
  ship: 'Ships',
  submarine: 'Submarines',
  carrier_group: 'Carrier Groups',
}

const STATUS_COLORS: Record<string, string> = {
  ready: 'var(--status-ready)',
  engaged: 'var(--status-engaged)',
  moving: 'var(--status-moving)',
  damaged: 'var(--status-damaged)',
  destroyed: 'var(--status-destroyed)',
  reloading: 'var(--status-engaged)',
}

const NATION_COLORS: Record<NationId, string> = {
  usa: 'var(--usa-primary)',
  iran: 'var(--iran-primary)',
}

const NATION_LABELS: Record<NationId, string> = {
  usa: 'UNITED STATES',
  iran: 'IRAN',
}

const NATIONS: NationId[] = ['usa', 'iran']

function StatusDot({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: STATUS_COLORS[status] ?? 'var(--text-muted)',
      flexShrink: 0,
      marginTop: 1,
    }} />
  )
}

function UnitRow({ unit, selected, onClick }: { unit: ViewUnit; selected: boolean; onClick: () => void }) {
  const destroyed = unit.status === 'destroyed'
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 6px',
        marginLeft: 16,
        borderRadius: 3,
        cursor: 'pointer',
        background: selected ? 'var(--bg-hover)' : 'transparent',
        borderLeft: selected ? '2px solid var(--border-accent)' : '2px solid transparent',
        opacity: destroyed ? 0.4 : 1,
      }}
    >
      <StatusDot status={unit.status} />
      <span style={{
        flex: 1,
        textDecoration: destroyed ? 'line-through' : 'none',
        color: destroyed ? 'var(--text-muted)' : 'var(--text-primary)',
        fontSize: 'var(--font-size-xs)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {unit.name}
      </span>
      <span style={{
        fontSize: 'var(--font-size-xs)',
        color: destroyed ? 'var(--status-destroyed)' : unit.health < 50 ? 'var(--status-damaged)' : 'var(--text-secondary)',
        flexShrink: 0,
      }}>
        {destroyed ? 'KIA' : `${Math.round(unit.health)}%`}
      </span>
    </div>
  )
}

function CategorySection({
  label,
  units,
  selectedUnitId,
  onSelect,
}: {
  label: string
  units: ViewUnit[]
  selectedUnitId: string | null
  onSelect: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 4px',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: 'var(--font-size-xs)',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 8 }}>{collapsed ? '▶' : '▼'}</span>
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>{units.length}</span>
      </div>
      {!collapsed && units.map(unit => (
        <UnitRow
          key={unit.id}
          unit={unit}
          selected={selectedUnitId === unit.id}
          onClick={() => onSelect(unit.id)}
        />
      ))}
    </div>
  )
}

function NationSection({
  nationId,
  units,
  selectedUnitId,
  onSelect,
}: {
  nationId: NationId
  units: ViewUnit[]
  selectedUnitId: string | null
  onSelect: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  // Group by category, only categories that have units
  const byCategory = new Map<UnitCategory, ViewUnit[]>()
  for (const unit of units) {
    if (!byCategory.has(unit.category)) byCategory.set(unit.category, [])
    byCategory.get(unit.category)!.push(unit)
  }

  const aliveCount = units.filter(u => u.status !== 'destroyed').length
  const destroyedCount = units.filter(u => u.status === 'destroyed').length

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 4px',
          cursor: 'pointer',
          borderBottom: `1px solid ${NATION_COLORS[nationId]}44`,
          marginBottom: 4,
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 8, color: 'var(--text-muted)' }}>{collapsed ? '▶' : '▼'}</span>
        <span style={{
          color: NATION_COLORS[nationId],
          fontWeight: 700,
          fontSize: 'var(--font-size-sm)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          {NATION_LABELS[nationId]}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
          {aliveCount} active
          {destroyedCount > 0 && ` / ${destroyedCount} lost`}
        </span>
      </div>
      {!collapsed && Array.from(byCategory.entries()).map(([cat, catUnits]) => (
        <CategorySection
          key={cat}
          label={CATEGORY_LABELS[cat] ?? cat}
          units={catUnits}
          selectedUnitId={selectedUnitId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

export default function OrbatPanel() {
  const units = useGameStore(s => s.viewState.units)
  const selectedUnitId = useUIStore(s => s.selectedUnitId)
  const selectUnit = useUIStore(s => s.selectUnit)

  // Group units by nation
  const byNation = new Map<NationId, ViewUnit[]>()
  for (const nation of NATIONS) byNation.set(nation, [])
  for (const unit of units) {
    if (byNation.has(unit.nation)) byNation.get(unit.nation)!.push(unit)
  }

  return (
    <Panel
      title="ORDER OF BATTLE"
      style={{
        position: 'absolute',
        top: 60,
        left: 12,
        maxHeight: '60vh',
        minWidth: 240,
        overflowY: 'auto',
      }}
    >
      {NATIONS.map(nationId => (
        <NationSection
          key={nationId}
          nationId={nationId}
          units={byNation.get(nationId) ?? []}
          selectedUnitId={selectedUnitId}
          onSelect={selectUnit}
        />
      ))}
    </Panel>
  )
}
