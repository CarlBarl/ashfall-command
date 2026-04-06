import { useState } from 'react'
import Panel from '@/components/common/Panel'
import IntelBudgetPanel from '@/components/panels/IntelBudgetPanel'
import { useIntelStore } from '@/store/intel-store'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { iranCatalog } from '@/data/catalog/iran-catalog'
import { usaCatalog } from '@/data/catalog/usa-catalog'
import type { UnitCatalogEntry } from '@/types/scenario'
import type { UnitCategory } from '@/types/game'

const CATEGORY_LABELS: Record<UnitCategory, string> = {
  airbase: 'Airbases',
  naval_base: 'Naval Bases',
  sam_site: 'Air Defense',
  missile_battery: 'Missiles & Launchers',
  aircraft: 'Aircraft',
  ship: 'Ships',
  submarine: 'Submarines',
  carrier_group: 'Carrier Groups',
}

/** Return the enemy catalog for the player's nation (modern scenarios only) */
function getEnemyCatalog(playerNation: string): UnitCatalogEntry[] {
  if (playerNation === 'usa') return iranCatalog
  if (playerNation === 'iran') return usaCatalog
  return [] // WW2 / other scenarios: no modern enemy catalog
}

function CatalogCategory({
  label,
  entries,
  placingCatalogId,
  onPlace,
}: {
  label: string
  entries: UnitCatalogEntry[]
  placingCatalogId: string | null
  onPlace: (id: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 4px',
          userSelect: 'none',
        }}
      >
        <span
          onClick={() => setCollapsed((c) => !c)}
          style={{ fontSize: 8, cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          {collapsed ? '\u25B6' : '\u25BC'}
        </span>
        <span
          onClick={() => setCollapsed((c) => !c)}
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
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
          {entries.length}
        </span>
      </div>
      {!collapsed &&
        entries.map((entry) => (
          <CatalogRow
            key={entry.id}
            entry={entry}
            isPlacing={placingCatalogId === entry.id}
            onPlace={() => onPlace(entry.id)}
          />
        ))}
    </div>
  )
}

function CatalogRow({
  entry,
  isPlacing,
  onPlace,
}: {
  entry: UnitCatalogEntry
  isPlacing: boolean
  onPlace: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 6px',
        marginLeft: 16,
        borderRadius: 3,
        background: isPlacing ? 'var(--bg-hover)' : 'transparent',
        borderLeft: isPlacing
          ? '2px solid var(--border-accent)'
          : '2px solid transparent',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-xs)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.name}
        </div>
        <div
          style={{
            color: 'var(--text-muted)',
            fontSize: '0.55rem',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {entry.description}
        </div>
      </div>
      <button
        onClick={onPlace}
        style={{
          background: isPlacing ? 'var(--border-accent)' : 'var(--bg-hover)',
          border: isPlacing
            ? '1px solid var(--border-accent)'
            : '1px solid var(--border-default)',
          borderRadius: 3,
          color: isPlacing ? '#fff' : 'var(--text-secondary)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.5rem',
          padding: '2px 6px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {isPlacing ? 'CANCEL' : 'PLACE'}
      </button>
    </div>
  )
}

function EstimateRow({
  estimate,
  onRemove,
}: {
  estimate: { id: string; name: string; position: { lat: number; lng: number }; confirmed: boolean }
  onRemove: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 6px',
        borderRadius: 3,
      }}
    >
      {estimate.confirmed ? (
        <span style={{ color: 'var(--status-ready)', fontSize: 10, flexShrink: 0 }}>
          {'\u2713'}
        </span>
      ) : (
        <span
          style={{
            display: 'inline-block',
            width: 6,
            height: 6,
            borderRadius: '50%',
            border: '1px solid var(--text-muted)',
            flexShrink: 0,
            marginTop: 1,
          }}
        />
      )}
      <span
        style={{
          flex: 1,
          color: estimate.confirmed ? 'var(--status-ready)' : 'var(--text-primary)',
          fontSize: 'var(--font-size-xs)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {estimate.name}
      </span>
      <span
        style={{
          color: 'var(--text-muted)',
          fontSize: '0.5rem',
          flexShrink: 0,
        }}
      >
        {estimate.position.lat.toFixed(1)},{estimate.position.lng.toFixed(1)}
      </span>
      <button
        onClick={onRemove}
        style={{
          background: 'none',
          border: '1px solid var(--border-default)',
          borderRadius: 3,
          color: 'var(--status-damaged)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.5rem',
          padding: '1px 4px',
          fontWeight: 600,
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        X
      </button>
    </div>
  )
}

export default function IntelPanel() {
  const estimatedUnits = useIntelStore((s) => s.estimatedUnits)
  const placingCatalogId = useIntelStore((s) => s.placingCatalogId)
  const setPlacing = useIntelStore((s) => s.setPlacing)
  const removeEstimate = useIntelStore((s) => s.removeEstimate)
  const toggleIntel = useUIStore((s) => s.toggleIntel)
  const playerNation = useGameStore((s) => s.viewState.playerNation)

  const catalog = getEnemyCatalog(playerNation)

  // Group catalog entries by category
  const byCategory = new Map<UnitCategory, UnitCatalogEntry[]>()
  for (const entry of catalog) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, [])
    byCategory.get(entry.category)!.push(entry)
  }

  const handlePlace = (catalogId: string) => {
    if (placingCatalogId === catalogId) {
      setPlacing(null)
    } else {
      setPlacing(catalogId)
    }
  }

  return (
    <Panel
      title="INTELLIGENCE"
      onClose={toggleIntel}
      style={{
        position: 'absolute',
        top: 44,
        right: 12,
        maxHeight: '70vh',
        minWidth: 280,
        overflowY: 'auto',
      }}
    >
      {/* Section 0: Budget Allocation */}
      <IntelBudgetPanel />

      {/* Section A: Enemy Catalog Browser (modern scenarios only) */}
      {catalog.length > 0 && <div style={{ marginBottom: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 4px',
            borderBottom: '1px solid var(--status-damaged)44',
            marginBottom: 4,
            userSelect: 'none',
          }}
        >
          <span
            style={{
              color: 'var(--status-damaged)',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              flex: 1,
            }}
          >
            ENEMY CATALOG
          </span>
          <span
            style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}
          >
            {catalog.length} types
          </span>
        </div>

        {placingCatalogId && (
          <div
            style={{
              color: 'var(--text-accent)',
              fontSize: '0.55rem',
              fontStyle: 'italic',
              padding: '2px 4px',
              marginBottom: 4,
            }}
          >
            Click on the map to place estimated position...
          </div>
        )}

        {Array.from(byCategory.entries()).map(([cat, entries]) => (
          <CatalogCategory
            key={cat}
            label={CATEGORY_LABELS[cat] ?? cat}
            entries={entries}
            placingCatalogId={placingCatalogId}
            onPlace={handlePlace}
          />
        ))}
      </div>}

      {/* Section B: Placed Estimates */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 4px',
            borderBottom: '1px solid var(--border-default)',
            marginBottom: 4,
            userSelect: 'none',
          }}
        >
          <span
            style={{
              color: 'var(--text-accent)',
              fontWeight: 700,
              fontSize: 'var(--font-size-sm)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              flex: 1,
            }}
          >
            ESTIMATES
          </span>
          <span
            style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}
          >
            {estimatedUnits.length}
          </span>
        </div>

        {estimatedUnits.length === 0 && (
          <div
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.55rem',
              fontStyle: 'italic',
              padding: '2px 4px',
            }}
          >
            No estimates placed. Use the catalog above to mark suspected enemy
            positions.
          </div>
        )}

        {estimatedUnits.map((est) => (
          <EstimateRow
            key={est.id}
            estimate={est}
            onRemove={() => removeEstimate(est.id)}
          />
        ))}
      </div>
    </Panel>
  )
}
