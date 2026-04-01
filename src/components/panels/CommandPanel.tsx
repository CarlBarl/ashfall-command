import { useState } from 'react'
import Panel from '@/components/common/Panel'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import type { ROE } from '@/types/game'

const ROE_OPTIONS: { value: ROE; label: string; color: string }[] = [
  { value: 'weapons_free', label: 'WEAPONS FREE', color: 'var(--status-ready)' },
  { value: 'weapons_tight', label: 'WEAPONS TIGHT', color: 'var(--status-engaged)' },
  { value: 'hold_fire', label: 'HOLD FIRE', color: 'var(--status-damaged)' },
]

export default function CommandPanel() {
  const selectedId = useUIStore((s) => s.selectedUnitId)
  const viewState = useGameStore((s) => s.viewState)
  const { units, nations } = viewState
  const [warClickPending, setWarClickPending] = useState(false)

  const selectedUnit = units.find((u) => u.id === selectedId)

  const usaNation = nations.find((n) => n.id === 'usa')
  const atWarWithIran = usaNation?.atWar.includes('iran') ?? false

  return (
    <Panel
      title="COMMAND AUTHORITY"
      style={{ position: 'absolute', bottom: 12, right: 320, width: 280 }}
    >
      {/* Selected unit ROE */}
      {selectedUnit && selectedUnit.nation === 'usa' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{
            color: 'var(--text-muted)',
            fontSize: 'var(--font-size-xs)',
            display: 'block',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {selectedUnit.name} ROE
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            {ROE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => sendCommand({
                  type: 'SET_ROE',
                  unitId: selectedUnit.id,
                  roe: opt.value,
                })}
                style={{
                  flex: 1,
                  padding: '5px 4px',
                  background: selectedUnit.roe === opt.value
                    ? opt.color
                    : 'var(--bg-hover)',
                  border: selectedUnit.roe === opt.value
                    ? `1px solid ${opt.color}`
                    : '1px solid var(--border-default)',
                  borderRadius: 4,
                  color: selectedUnit.roe === opt.value
                    ? 'var(--bg-primary)'
                    : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: selectedUnit.roe === opt.value ? 700 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Theater-wide ROE */}
      <div style={{ marginBottom: 12 }}>
        <label style={{
          color: 'var(--text-muted)',
          fontSize: 'var(--font-size-xs)',
          display: 'block',
          marginBottom: 4,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          ALL US FORCES
        </label>
        <div style={{ display: 'flex', gap: 4 }}>
          {ROE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                const usaUnits = units.filter(
                  (u) => u.nation === 'usa' && u.status !== 'destroyed',
                )
                for (const u of usaUnits) {
                  sendCommand({ type: 'SET_ROE', unitId: u.id, roe: opt.value })
                }
              }}
              style={{
                flex: 1,
                padding: '5px 4px',
                background: 'var(--bg-hover)',
                border: '1px solid var(--border-default)',
                borderRadius: 4,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
                whiteSpace: 'nowrap',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{
        borderTop: '1px solid var(--border-default)',
        marginBottom: 10,
        paddingTop: 10,
      }}>
        {/* War / Cease Fire */}
        {!atWarWithIran ? (
          <button
            onClick={() => {
              if (!warClickPending) {
                setWarClickPending(true)
                return
              }
              sendCommand({ type: 'DECLARE_WAR', target: 'iran' })
              setWarClickPending(false)
            }}
            onBlur={() => setWarClickPending(false)}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: warClickPending ? 'var(--status-damaged)' : 'var(--iran-secondary)',
              border: warClickPending
                ? '2px solid var(--status-damaged)'
                : '1px solid var(--iran-primary)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {warClickPending ? 'CLICK AGAIN TO CONFIRM' : 'DECLARE WAR ON IRAN'}
          </button>
        ) : (
          <button
            onClick={() => sendCommand({ type: 'CEASE_FIRE', target: 'iran' })}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            CEASE FIRE
          </button>
        )}
      </div>
    </Panel>
  )
}
