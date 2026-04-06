import { useCallback } from 'react'
import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useGroundStore } from '@/store/ground-store'
import { sendCommand } from '@/store/bridge'
import type { GeneralOrder, GeneralReport } from '@/types/ground'
import type { ViewGeneral, ViewArmyGroup } from '@/types/view'

// ─── Order button definitions ───

type OrderType = GeneralOrder['type']

const ORDER_BUTTONS: { type: OrderType; label: string; color: string }[] = [
  { type: 'ADVANCE', label: 'ADVANCE', color: 'var(--status-ready)' },
  { type: 'HOLD_LINE', label: 'HOLD', color: 'var(--text-accent)' },
  { type: 'ENCIRCLE', label: 'ENCIRCLE', color: 'var(--status-engaged)' },
  { type: 'WITHDRAW', label: 'WITHDRAW', color: 'var(--status-damaged)' },
  { type: 'RESERVE', label: 'RESERVE', color: 'var(--text-muted)' },
]

const SEVERITY_COLORS: Record<string, string> = {
  info: 'var(--text-secondary)',
  warning: 'var(--status-engaged)',
  critical: 'var(--status-damaged)',
}

// ─── Component ───

interface GeneralPanelProps {
  /** All generals for the player nation */
  generals: ViewGeneral[]
  /** All army groups for the player nation */
  armyGroups: ViewArmyGroup[]
}

export default function GeneralPanel({ generals, armyGroups }: GeneralPanelProps) {
  // Destructure individual selectors to avoid infinite render loops
  const selectedGeneralId = useGroundStore((s) => s.selectedGeneralId)
  const selectGeneral = useGroundStore((s) => s.selectGeneral)
  const setOrderingMode = useGroundStore((s) => s.setOrderingMode)
  const setPendingOrderType = useGroundStore((s) => s.setPendingOrderType)
  const orderingMode = useGroundStore((s) => s.orderingMode)

  const general = generals.find((g) => g.id === selectedGeneralId)

  const handleOrderClick = useCallback(
    (orderType: OrderType) => {
      if (!general) return
      if (orderType === 'ADVANCE' || orderType === 'ENCIRCLE') {
        // These need a map target, enter ordering mode
        setPendingOrderType(orderType)
        setOrderingMode(true)
        return
      }
      // Immediate orders — send directly
      if (orderType === 'HOLD_LINE') {
        sendCommand({ type: 'GENERAL_ORDER', generalId: general.id, order: { type: 'HOLD_LINE' } })
      } else if (orderType === 'RESERVE') {
        sendCommand({ type: 'GENERAL_ORDER', generalId: general.id, order: { type: 'RESERVE' } })
      } else if (orderType === 'WITHDRAW') {
        sendCommand({ type: 'GENERAL_ORDER', generalId: general.id, order: { type: 'WITHDRAW', fallbackCol: 0, fallbackRow: 0 } })
      }
    },
    [general, setOrderingMode, setPendingOrderType],
  )

  if (!general) return null

  const armyGroup = armyGroups.find((ag) => ag.generalId === general.id)
  const currentOrderType = general.currentOrder?.type ?? 'RESERVE'

  return (
    <Panel
      title={general.name}
      onClose={() => selectGeneral(null)}
      style={{ position: 'absolute', top: 60, right: 12, minWidth: 280 }}
    >
      {/* Army Group badge */}
      {armyGroup && (
        <div style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
          marginBottom: 8,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {armyGroup.name} -- {armyGroup.divisionIds.length} divisions
        </div>
      )}

      {/* Trait bars */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          marginBottom: 4,
          letterSpacing: '0.05em',
        }}>
          Traits
        </div>
        <StatBar label="AGGRESSION" value={general.traits.aggression} max={10} color="var(--status-damaged)" />
        <StatBar label="CAUTION" value={general.traits.caution} max={10} color="var(--text-accent)" />
        <StatBar label="LOGISTICS" value={general.traits.logistics} max={10} color="var(--status-ready)" />
        <StatBar label="INNOVATION" value={general.traits.innovation} max={10} color="var(--status-engaged)" />
        <StatBar label="MORALE" value={general.traits.morale} max={10} color="#a78bfa" />
      </div>

      {/* Current order status */}
      <div style={{
        marginBottom: 10,
        padding: '6px 8px',
        background: 'var(--bg-hover)',
        borderRadius: 4,
        borderLeft: '3px solid var(--text-accent)',
      }}>
        <div style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          marginBottom: 2,
        }}>
          Current Order
        </div>
        <div style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}>
          {currentOrderType.replace(/_/g, ' ')}
          {orderingMode && (
            <span style={{
              color: 'var(--status-engaged)',
              marginLeft: 8,
              fontSize: 'var(--font-size-xs)',
              fontWeight: 400,
            }}>
              [Click map to set objective]
            </span>
          )}
        </div>
      </div>

      {/* Order buttons */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 4,
        marginBottom: 10,
      }}>
        {ORDER_BUTTONS.map((btn) => {
          const isActive = currentOrderType === btn.type
          return (
            <button
              key={btn.type}
              onClick={() => handleOrderClick(btn.type)}
              style={{
                padding: '6px 4px',
                background: isActive ? btn.color : 'var(--bg-hover)',
                border: isActive
                  ? `1px solid ${btn.color}`
                  : '1px solid var(--border-default)',
                borderRadius: 4,
                color: isActive ? 'var(--bg-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: isActive ? 700 : 400,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              {btn.label}
            </button>
          )
        })}
      </div>

      {/* Reports feed */}
      <div style={{
        borderTop: '1px solid var(--border-default)',
        paddingTop: 8,
      }}>
        <div style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          marginBottom: 6,
          letterSpacing: '0.05em',
        }}>
          Reports
        </div>
        <div style={{
          maxHeight: 160,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          {general.pendingReports.length === 0 && (
            <div style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              padding: '4px 0',
            }}>
              No reports yet.
            </div>
          )}
          {general.pendingReports.slice(-20).reverse().map((report: GeneralReport, i: number) => (
            <ReportRow key={`${report.tick}-${i}`} report={report} />
          ))}
        </div>
      </div>
    </Panel>
  )
}

// ─── Sub-components ───

function ReportRow({ report }: { report: GeneralReport }) {
  return (
    <div style={{
      padding: '4px 6px',
      background: 'var(--bg-hover)',
      borderRadius: 3,
      borderLeft: `2px solid ${SEVERITY_COLORS[report.severity] ?? 'var(--text-muted)'}`,
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: 2,
      }}>
        <span style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          color: SEVERITY_COLORS[report.severity] ?? 'var(--text-secondary)',
          textTransform: 'uppercase',
        }}>
          {report.type.replace(/_/g, ' ')}
        </span>
        <span style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
        }}>
          T+{report.tick}
        </span>
      </div>
      <div style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        lineHeight: 1.3,
      }}>
        {report.message}
      </div>
    </div>
  )
}
