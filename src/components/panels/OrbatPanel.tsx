import { useState, type MouseEvent } from 'react'
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

function UnitRow({ unit, selected, onClick }: { unit: ViewUnit; selected: boolean; onClick: (e: MouseEvent) => void }) {
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
      {selected && (
        <span style={{ color: 'var(--text-accent)', fontSize: '0.55rem', fontWeight: 600, flexShrink: 0 }}>
          SEL
        </span>
      )}
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
  selectedUnitIds,
  onSelectUnit,
  onSelectAll,
}: {
  label: string
  units: ViewUnit[]
  selectedUnitIds: Set<string>
  onSelectUnit: (id: string, e: MouseEvent) => void
  onSelectAll: (ids: string[]) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const aliveUnits = units.filter(u => u.status !== 'destroyed')
  const allSelected = aliveUnits.length > 0 && aliveUnits.every(u => selectedUnitIds.has(u.id))

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 4px',
        userSelect: 'none',
      }}>
        <span
          onClick={() => setCollapsed(c => !c)}
          style={{ fontSize: 8, cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          {collapsed ? '▶' : '▼'}
        </span>
        <span
          onClick={() => setCollapsed(c => !c)}
          style={{
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-size-xs)',
            cursor: 'pointer',
            flex: 1,
          }}
        >
          {label}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>{units.length}</span>
        {/* SELECT ALL button for this category */}
        {aliveUnits.length > 1 && (
          <button
            onClick={() => onSelectAll(aliveUnits.map(u => u.id))}
            style={{
              background: allSelected ? 'var(--border-accent)' : 'none',
              border: `1px solid ${allSelected ? 'var(--border-accent)' : 'var(--border-default)'}`,
              borderRadius: 3,
              color: allSelected ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.5rem',
              padding: '1px 4px',
              fontWeight: 600,
            }}
          >
            ALL
          </button>
        )}
      </div>
      {!collapsed && units.map(unit => (
        <UnitRow
          key={unit.id}
          unit={unit}
          selected={selectedUnitIds.has(unit.id)}
          onClick={(e) => onSelectUnit(unit.id, e)}
        />
      ))}
    </div>
  )
}

function NationSection({
  nationId,
  units,
  selectedUnitIds,
  onSelectUnit,
  onSelectAll,
}: {
  nationId: NationId
  units: ViewUnit[]
  selectedUnitIds: Set<string>
  onSelectUnit: (id: string, e: MouseEvent) => void
  onSelectAll: (ids: string[]) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  const byCategory = new Map<UnitCategory, ViewUnit[]>()
  for (const unit of units) {
    if (!byCategory.has(unit.category)) byCategory.set(unit.category, [])
    byCategory.get(unit.category)!.push(unit)
  }

  const aliveCount = units.filter(u => u.status !== 'destroyed').length
  const destroyedCount = units.filter(u => u.status === 'destroyed').length
  const aliveUnits = units.filter(u => u.status !== 'destroyed')

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 4px',
        borderBottom: `1px solid ${NATION_COLORS[nationId]}44`,
        marginBottom: 4,
        userSelect: 'none',
      }}>
        <span
          onClick={() => setCollapsed(c => !c)}
          style={{ fontSize: 8, color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          {collapsed ? '▶' : '▼'}
        </span>
        <span
          onClick={() => setCollapsed(c => !c)}
          style={{
            color: NATION_COLORS[nationId],
            fontWeight: 700,
            fontSize: 'var(--font-size-sm)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            flex: 1,
          }}
        >
          {NATION_LABELS[nationId]}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
          {aliveCount} active
          {destroyedCount > 0 && ` / ${destroyedCount} lost`}
        </span>
        {/* SELECT ALL for this nation */}
        {nationId === 'usa' && aliveUnits.length > 1 && (
          <button
            onClick={() => onSelectAll(aliveUnits.map(u => u.id))}
            style={{
              background: 'none',
              border: '1px solid var(--border-accent)',
              borderRadius: 3,
              color: 'var(--text-accent)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.5rem',
              padding: '1px 5px',
              fontWeight: 700,
            }}
          >
            SELECT ALL
          </button>
        )}
      </div>
      {!collapsed && Array.from(byCategory.entries()).map(([cat, catUnits]) => (
        <CategorySection
          key={cat}
          label={CATEGORY_LABELS[cat] ?? cat}
          units={catUnits}
          selectedUnitIds={selectedUnitIds}
          onSelectUnit={onSelectUnit}
          onSelectAll={onSelectAll}
        />
      ))}
    </div>
  )
}

export default function OrbatPanel() {
  const units = useGameStore(s => s.viewState.units)
  const selectedUnitIds = useUIStore(s => s.selectedUnitIds)
  const selectUnit = useUIStore(s => s.selectUnit)
  const toggleUnitSelection = useUIStore(s => s.toggleUnitSelection)
  const selectMultipleUnits = useUIStore(s => s.selectMultipleUnits)

  const byNation = new Map<NationId, ViewUnit[]>()
  for (const nation of NATIONS) byNation.set(nation, [])
  for (const unit of units) {
    if (byNation.has(unit.nation)) byNation.get(unit.nation)!.push(unit)
  }

  const handleSelectUnit = (id: string, e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      toggleUnitSelection(id)
    } else {
      selectUnit(id)
    }
  }

  const handleSelectAll = (ids: string[]) => {
    selectMultipleUnits(ids)
  }

  return (
    <Panel
      title="ORDER OF BATTLE"
      style={{
        position: 'absolute',
        top: 44,
        left: 12,
        maxHeight: '60vh',
        minWidth: 240,
        overflowY: 'auto',
      }}
    >
      <div style={{ color: 'var(--text-muted)', fontSize: '0.5rem', fontStyle: 'italic', marginBottom: 4 }}>
        Click to select / Cmd+click for multi-select
      </div>
      {NATIONS.map(nation => (
        <NationSection
          key={nation}
          nationId={nation}
          units={byNation.get(nation) ?? []}
          selectedUnitIds={selectedUnitIds}
          onSelectUnit={handleSelectUnit}
          onSelectAll={handleSelectAll}
        />
      ))}
    </Panel>
  )
}
