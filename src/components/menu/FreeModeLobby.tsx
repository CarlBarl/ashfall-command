import { useState, useMemo, type CSSProperties } from 'react'
import { useMenuStore, type FreeModeUnit } from '@/store/menu-store'
import type { NationId, UnitCategory } from '@/types/game'
import type { UnitCatalogEntry } from '@/types/scenario'
import { usaCatalog } from '@/data/catalog/usa-catalog'
import { iranCatalog } from '@/data/catalog/iran-catalog'

const CATALOGS: Record<string, UnitCatalogEntry[]> = {
  usa: usaCatalog,
  iran: iranCatalog,
}

const CATEGORY_ORDER: UnitCategory[] = [
  'sam_site',
  'airbase',
  'missile_battery',
  'ship',
  'carrier_group',
  'submarine',
  'naval_base',
  'aircraft',
]

const CATEGORY_LABELS: Record<UnitCategory, string> = {
  airbase: 'Airbases',
  naval_base: 'Naval Bases',
  sam_site: 'Air Defense',
  missile_battery: 'Missiles',
  aircraft: 'Aircraft',
  ship: 'Naval',
  submarine: 'Submarines',
  carrier_group: 'Carrier Groups',
}

// ── Styles ──────────────────────────────────────────────────────────

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--bg-primary)',
  fontFamily: 'var(--font-mono)',
  overflowY: 'auto',
}

const gridBg: CSSProperties = {
  position: 'fixed',
  inset: 0,
  backgroundImage:
    'linear-gradient(rgba(88,166,255,0.03) 1px, transparent 1px), ' +
    'linear-gradient(90deg, rgba(88,166,255,0.03) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
  pointerEvents: 'none',
}

const contentArea: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  width: '100%',
  maxWidth: 1000,
  margin: '0 auto',
  padding: '32px 24px',
  flex: 1,
}

const topBar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 24,
  flexWrap: 'wrap',
  gap: 12,
}

const backBtn: CSSProperties = {
  background: 'none',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--panel-radius)',
  padding: '6px 16px',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  color: 'var(--text-secondary)',
  letterSpacing: '0.1em',
  transition: 'border-color 0.15s',
}

const columns: CSSProperties = {
  display: 'flex',
  gap: 20,
  marginBottom: 24,
  minHeight: 400,
}

const column: CSSProperties = {
  flex: 1,
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--panel-radius)',
  padding: 'var(--panel-padding)',
  overflowY: 'auto',
  maxHeight: 'calc(100vh - 280px)',
}

// ── Sub-components ──────────────────────────────────────────────────

function BudgetBar({ budget, nation }: { budget: number; nation: NationId }) {
  const color = nation === 'usa' ? 'var(--usa-primary)' : 'var(--iran-primary)'
  const label = nation === 'usa' ? 'UNITED STATES' : 'IRAN'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
      <span
        style={{
          fontWeight: 700,
          fontSize: 'var(--font-size-sm)',
          color,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 'var(--font-size-lg)',
          fontWeight: 700,
          color: budget > 2000 ? 'var(--status-ready)' : budget > 0 ? 'var(--status-engaged)' : 'var(--status-damaged)',
          letterSpacing: '0.05em',
        }}
      >
        ${budget.toLocaleString()}M
      </span>
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
          letterSpacing: '0.05em',
        }}
      >
        REMAINING
      </span>
    </div>
  )
}

function CatalogItem({
  entry,
  onAdd,
  disabled,
}: {
  entry: UnitCatalogEntry
  onAdd: () => void
  disabled: boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        borderRadius: 3,
        background: hovered ? 'var(--bg-hover)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {entry.name}
        </div>
        <div
          style={{
            fontSize: '0.6rem',
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {entry.description}
        </div>
      </div>
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
          flexShrink: 0,
          minWidth: 50,
          textAlign: 'right',
        }}
      >
        ${entry.cost_millions}M
      </span>
      <button
        onClick={onAdd}
        disabled={disabled}
        style={{
          background: disabled ? 'transparent' : 'none',
          border: `1px solid ${disabled ? 'var(--border-default)' : 'var(--status-ready)'}`,
          borderRadius: 3,
          color: disabled ? 'var(--text-muted)' : 'var(--status-ready)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem',
          fontWeight: 700,
          padding: '2px 8px',
          flexShrink: 0,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        ADD
      </button>
    </div>
  )
}

function SelectedUnitRow({
  unit,
  index,
  onRemove,
}: {
  unit: FreeModeUnit
  index: number
  onRemove: (i: number) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        borderBottom: '1px solid var(--border-default)',
      }}
    >
      <span
        style={{
          flex: 1,
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {unit.name}
      </span>
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
          flexShrink: 0,
        }}
      >
        ${unit.cost_millions}M
      </span>
      <button
        onClick={() => onRemove(index)}
        style={{
          background: 'none',
          border: '1px solid var(--status-damaged)',
          borderRadius: 3,
          color: 'var(--status-damaged)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.55rem',
          fontWeight: 700,
          padding: '1px 6px',
          flexShrink: 0,
        }}
      >
        X
      </button>
    </div>
  )
}

function CatalogBrowser({
  catalog,
  budget,
  onAdd,
}: {
  catalog: UnitCatalogEntry[]
  budget: number
  onAdd: (entry: UnitCatalogEntry) => void
}) {
  const grouped = useMemo(() => {
    const map = new Map<UnitCategory, UnitCatalogEntry[]>()
    for (const entry of catalog) {
      if (!map.has(entry.category)) map.set(entry.category, [])
      map.get(entry.category)!.push(entry)
    }
    return map
  }, [catalog])

  return (
    <div>
      {CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => (
        <div key={cat} style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '4px 8px',
              borderBottom: '1px solid var(--border-default)',
              marginBottom: 4,
            }}
          >
            {CATEGORY_LABELS[cat]}
          </div>
          {grouped.get(cat)!.map((entry) => (
            <CatalogItem
              key={entry.id}
              entry={entry}
              onAdd={() => onAdd(entry)}
              disabled={entry.cost_millions > budget}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function UnitList({
  units,
  onRemove,
  emptyLabel,
}: {
  units: FreeModeUnit[]
  onRemove: (i: number) => void
  emptyLabel: string
}) {
  if (units.length === 0) {
    return (
      <div
        style={{
          padding: 24,
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: 'var(--font-size-xs)',
          letterSpacing: '0.05em',
        }}
      >
        {emptyLabel}
      </div>
    )
  }

  const totalCost = units.reduce((sum, u) => sum + u.cost_millions, 0)

  return (
    <div>
      {units.map((u, i) => (
        <SelectedUnitRow key={`${u.catalogId}-${i}`} unit={u} index={i} onRemove={onRemove} />
      ))}
      <div
        style={{
          padding: '8px',
          textAlign: 'right',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
          borderTop: '1px solid var(--border-default)',
          marginTop: 4,
        }}
      >
        {units.length} unit{units.length !== 1 ? 's' : ''} // ${totalCost.toLocaleString()}M
      </div>
    </div>
  )
}

// ── Main ────────────────────────────────────────────────────────────

export default function FreeModeLobby() {
  const screen = useMenuStore((s) => s.screen)
  const selectedNation = useMenuStore((s) => s.selectedNation)
  const freeBudget = useMenuStore((s) => s.freeBudget)
  const freeUnits = useMenuStore((s) => s.freeUnits)
  const freeEnemyUnits = useMenuStore((s) => s.freeEnemyUnits)
  const setScreen = useMenuStore((s) => s.setScreen)
  const addFreeUnit = useMenuStore((s) => s.addFreeUnit)
  const removeFreeUnit = useMenuStore((s) => s.removeFreeUnit)
  const addFreeEnemyUnit = useMenuStore((s) => s.addFreeEnemyUnit)
  const removeFreeEnemyUnit = useMenuStore((s) => s.removeFreeEnemyUnit)
  const resetFreeMode = useMenuStore((s) => s.resetFreeMode)

  const [showEnemySetup, setShowEnemySetup] = useState(false)

  if (screen !== 'free-lobby') return null

  const enemyNation: NationId = selectedNation === 'usa' ? 'iran' : 'usa'
  const playerCatalog = CATALOGS[selectedNation]
  const enemyCatalog = CATALOGS[enemyNation]

  const handleAddUnit = (entry: UnitCatalogEntry) => {
    addFreeUnit({
      catalogId: entry.id,
      name: entry.name,
      category: entry.category,
      cost_millions: entry.cost_millions,
    })
  }

  const handleAddEnemyUnit = (entry: UnitCatalogEntry) => {
    addFreeEnemyUnit({
      catalogId: entry.id,
      name: entry.name,
      category: entry.category,
      cost_millions: entry.cost_millions,
    })
  }

  const handleDeploy = () => {
    setScreen('deployment')
  }

  const handleBack = () => {
    resetFreeMode()
    setScreen('start')
  }

  return (
    <div style={overlay}>
      <div style={gridBg} />
      <div style={contentArea}>
        {/* Top bar */}
        <div style={topBar}>
          <button
            onClick={handleBack}
            style={backBtn}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--text-secondary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)'
            }}
          >
            &larr; BACK
          </button>
          <BudgetBar budget={freeBudget} nation={selectedNation} />
        </div>

        {/* Header */}
        <div
          style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 700,
            letterSpacing: '0.15em',
            color: 'var(--text-primary)',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          FREE MODE SETUP
        </div>
        <div
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            marginBottom: 20,
          }}
        >
          Build your force composition from the catalog
        </div>

        {/* Player forces */}
        <div
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 700,
            color: selectedNation === 'usa' ? 'var(--usa-primary)' : 'var(--iran-primary)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          YOUR FORCES
        </div>
        <div style={columns}>
          <div style={column}>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                color: 'var(--text-accent)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 8,
                paddingBottom: 4,
                borderBottom: '1px solid var(--border-default)',
              }}
            >
              UNIT CATALOG
            </div>
            <CatalogBrowser catalog={playerCatalog} budget={freeBudget} onAdd={handleAddUnit} />
          </div>
          <div style={column}>
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 600,
                color: 'var(--text-accent)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 8,
                paddingBottom: 4,
                borderBottom: '1px solid var(--border-default)',
              }}
            >
              SELECTED UNITS
            </div>
            <UnitList
              units={freeUnits}
              onRemove={removeFreeUnit}
              emptyLabel="Add units from the catalog on the left"
            />
          </div>
        </div>

        {/* Enemy toggle */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setShowEnemySetup(!showEnemySetup)}
            style={{
              background: showEnemySetup ? 'var(--bg-hover)' : 'transparent',
              border: `1px solid ${showEnemySetup ? 'var(--border-accent)' : 'var(--border-default)'}`,
              borderRadius: 'var(--panel-radius)',
              padding: '8px 20px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              color: showEnemySetup ? 'var(--text-accent)' : 'var(--text-secondary)',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              transition: 'all 0.15s',
            }}
          >
            {showEnemySetup ? '[-] HIDE ENEMY SETUP' : '[+] SET ENEMY UNITS'}
          </button>
          {!showEnemySetup && (
            <span
              style={{
                marginLeft: 12,
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}
            >
              AI will deploy enemy forces
            </span>
          )}
        </div>

        {/* Enemy forces (optional) */}
        {showEnemySetup && (
          <>
            <div
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 700,
                color: enemyNation === 'usa' ? 'var(--usa-primary)' : 'var(--iran-primary)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              ENEMY FORCES ({enemyNation.toUpperCase()})
            </div>
            <div style={columns}>
              <div style={column}>
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    color: 'var(--text-accent)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                    paddingBottom: 4,
                    borderBottom: '1px solid var(--border-default)',
                  }}
                >
                  ENEMY CATALOG
                </div>
                <CatalogBrowser
                  catalog={enemyCatalog}
                  budget={Infinity}
                  onAdd={handleAddEnemyUnit}
                />
              </div>
              <div style={column}>
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    color: 'var(--text-accent)',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                    paddingBottom: 4,
                    borderBottom: '1px solid var(--border-default)',
                  }}
                >
                  ENEMY UNITS
                </div>
                <UnitList
                  units={freeEnemyUnits}
                  onRemove={removeFreeEnemyUnit}
                  emptyLabel="Add enemy units or let AI decide"
                />
              </div>
            </div>
          </>
        )}

        {/* Deploy */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 32px' }}>
          <button
            onClick={handleDeploy}
            disabled={freeUnits.length === 0}
            style={{
              background: freeUnits.length > 0 ? 'var(--text-accent)' : 'transparent',
              border:
                freeUnits.length > 0
                  ? '1px solid var(--text-accent)'
                  : '1px solid var(--border-default)',
              borderRadius: 'var(--panel-radius)',
              padding: '12px 56px',
              cursor: freeUnits.length > 0 ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-base)',
              fontWeight: 700,
              letterSpacing: '0.15em',
              color: freeUnits.length > 0 ? '#fff' : 'var(--text-muted)',
              textTransform: 'uppercase',
              transition: 'all 0.15s',
              opacity: freeUnits.length > 0 ? 1 : 0.5,
            }}
          >
            DEPLOY
          </button>
        </div>
      </div>
    </div>
  )
}
