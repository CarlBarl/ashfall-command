import { useState, type MouseEvent } from 'react'
import Panel from '@/components/common/Panel'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import type { NationId, UnitCategory } from '@/types/game'
import type { ViewUnit, ViewGroundUnit, ViewArmyGroup, ViewGeneral } from '@/types/view'
import type { DivisionType } from '@/types/ground'

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

const DIVISION_TYPE_LABELS: Record<DivisionType, string> = {
  infantry: 'Infantry',
  armor: 'Armor',
  mechanized: 'Mechanized',
  artillery: 'Artillery',
  airborne: 'Airborne',
  mountain: 'Mountain',
}

const STATUS_COLORS: Record<string, string> = {
  ready: 'var(--status-ready)',
  engaged: 'var(--status-engaged)',
  moving: 'var(--status-moving)',
  damaged: 'var(--status-damaged)',
  destroyed: 'var(--status-destroyed)',
  reloading: 'var(--status-engaged)',
  active: 'var(--status-ready)',
  routing: 'var(--status-damaged)',
  encircled: 'var(--status-engaged)',
  reserve: 'var(--text-muted)',
}

const NATION_COLORS: Record<string, string> = {
  usa: 'var(--usa-primary)',
  iran: 'var(--iran-primary)',
  germany: '#6a85a8',
  poland: '#a88060',
}

function getNationLabel(id: string, nations: { id: string; name: string }[]): string {
  const nation = nations.find(n => n.id === id)
  return nation?.name?.toUpperCase() ?? id.toUpperCase()
}

function getNationColor(id: string): string {
  return NATION_COLORS[id] ?? 'var(--text-accent)'
}

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

function GroundUnitRow({ unit }: { unit: ViewGroundUnit }) {
  const destroyed = unit.status === 'destroyed'
  const stanceLabel = unit.stance === 'attack' ? 'ATK' : unit.stance === 'defend' ? 'DEF' : unit.stance === 'retreat' ? 'RET' : unit.stance === 'fortify' ? 'FRT' : 'RSV'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 6px',
        marginLeft: 16,
        borderRadius: 3,
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
        fontSize: '0.5rem',
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}>
        {stanceLabel}
      </span>
      <span style={{
        fontSize: 'var(--font-size-xs)',
        color: destroyed ? 'var(--status-destroyed)' : unit.strength < 50 ? 'var(--status-damaged)' : 'var(--text-secondary)',
        flexShrink: 0,
        minWidth: 28,
        textAlign: 'right',
      }}>
        {destroyed ? 'KIA' : `${Math.round(unit.strength)}%`}
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
          {collapsed ? '>' : 'v'}
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

/** Collapsible section showing ground divisions grouped by army group */
function ArmyGroupSection({
  armyGroup,
  general,
  groundUnits,
}: {
  armyGroup: ViewArmyGroup
  general: ViewGeneral | undefined
  groundUnits: ViewGroundUnit[]
}) {
  const [collapsed, setCollapsed] = useState(false)
  const activeCount = groundUnits.filter(u => u.status !== 'destroyed').length
  const byType = new Map<DivisionType, ViewGroundUnit[]>()
  for (const gu of groundUnits) {
    if (!byType.has(gu.type)) byType.set(gu.type, [])
    byType.get(gu.type)!.push(gu)
  }

  return (
    <div style={{ marginBottom: 6 }}>
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
          {collapsed ? '>' : 'v'}
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
          {armyGroup.name}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
          {activeCount}/{groundUnits.length}
        </span>
      </div>
      {general && !collapsed && (
        <div style={{
          marginLeft: 16,
          fontSize: '0.5rem',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          marginBottom: 2,
        }}>
          Gen. {general.name}
          {general.currentOrder && ` — ${general.currentOrder.type.replace('_', ' ')}`}
        </div>
      )}
      {!collapsed && Array.from(byType.entries()).map(([type, units]) => (
        <div key={type} style={{ marginBottom: 2 }}>
          <div style={{
            marginLeft: 12,
            fontSize: '0.5rem',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {DIVISION_TYPE_LABELS[type] ?? type} ({units.length})
          </div>
          {units.map(u => <GroundUnitRow key={u.id} unit={u} />)}
        </div>
      ))}
    </div>
  )
}

function NationSection({
  nationId,
  nationLabel,
  units,
  groundUnits,
  armyGroups,
  generals,
  selectedUnitIds,
  onSelectUnit,
  onSelectAll,
  isPlayerNation,
}: {
  nationId: NationId
  nationLabel: string
  units: ViewUnit[]
  groundUnits: ViewGroundUnit[]
  armyGroups: ViewArmyGroup[]
  generals: ViewGeneral[]
  selectedUnitIds: Set<string>
  onSelectUnit: (id: string, e: MouseEvent) => void
  onSelectAll: (ids: string[]) => void
  isPlayerNation: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const hasModernUnits = units.length > 0
  const hasGroundUnits = groundUnits.length > 0

  const byCategory = new Map<UnitCategory, ViewUnit[]>()
  for (const unit of units) {
    if (!byCategory.has(unit.category)) byCategory.set(unit.category, [])
    byCategory.get(unit.category)!.push(unit)
  }

  const aliveCount = units.filter(u => u.status !== 'destroyed').length
  const groundAliveCount = groundUnits.filter(u => u.status !== 'destroyed').length
  const totalActive = aliveCount + groundAliveCount
  const aliveUnits = units.filter(u => u.status !== 'destroyed')

  const nationColor = getNationColor(nationId)

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 4px',
        borderBottom: `1px solid ${nationColor}44`,
        marginBottom: 4,
        userSelect: 'none',
      }}>
        <span
          onClick={() => setCollapsed(c => !c)}
          style={{ fontSize: 8, color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          {collapsed ? '>' : 'v'}
        </span>
        <span
          onClick={() => setCollapsed(c => !c)}
          style={{
            color: nationColor,
            fontWeight: 700,
            fontSize: 'var(--font-size-sm)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            flex: 1,
          }}
        >
          {nationLabel}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
          {totalActive} active
        </span>
        {isPlayerNation && aliveUnits.length > 1 && (
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
      {!collapsed && hasModernUnits && Array.from(byCategory.entries()).map(([cat, catUnits]) => (
        <CategorySection
          key={cat}
          label={CATEGORY_LABELS[cat] ?? cat}
          units={catUnits}
          selectedUnitIds={selectedUnitIds}
          onSelectUnit={onSelectUnit}
          onSelectAll={onSelectAll}
        />
      ))}
      {!collapsed && hasGroundUnits && armyGroups.map(ag => (
        <ArmyGroupSection
          key={ag.id}
          armyGroup={ag}
          general={generals.find(g => g.id === ag.generalId)}
          groundUnits={groundUnits.filter(gu => gu.armyGroupId === ag.id)}
        />
      ))}
    </div>
  )
}

export default function OrbatPanel() {
  const viewState = useGameStore(s => s.viewState)
  const units = viewState.units
  const nations = viewState.nations
  const playerNation = viewState.playerNation
  const vGroundUnits = viewState.groundUnits ?? []
  const vGenerals = viewState.generals ?? []
  const vArmyGroups = viewState.armyGroups ?? []
  const selectedUnitIds = useUIStore(s => s.selectedUnitIds)
  const selectUnit = useUIStore(s => s.selectUnit)
  const toggleUnitSelection = useUIStore(s => s.toggleUnitSelection)
  const selectMultipleUnits = useUIStore(s => s.selectMultipleUnits)

  // Get unique nation IDs from the actual game data
  const nationIds = nations.map(n => n.id as NationId)

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
      {nationIds.map(nation => (
        <NationSection
          key={nation}
          nationId={nation}
          nationLabel={getNationLabel(nation, nations)}
          units={units.filter(u => u.nation === nation)}
          groundUnits={vGroundUnits.filter(gu => gu.nation === nation)}
          armyGroups={vArmyGroups.filter(ag => ag.nation === nation)}
          generals={vGenerals.filter(g => g.nation === nation)}
          selectedUnitIds={selectedUnitIds}
          onSelectUnit={handleSelectUnit}
          onSelectAll={handleSelectAll}
          isPlayerNation={nation === playerNation}
        />
      ))}
    </Panel>
  )
}
