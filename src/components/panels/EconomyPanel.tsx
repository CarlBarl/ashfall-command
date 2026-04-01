import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useGameStore } from '@/store/game-store'
import type { Nation } from '@/types/game'

function reserveColor(reserves: number): string {
  if (reserves > 50) return 'var(--status-ready)'
  if (reserves > 10) return 'var(--status-engaged)'
  return 'var(--status-damaged)'
}

function fmt(billions: number, decimals = 0): string {
  if (billions >= 1000) return `$${(billions / 1000).toFixed(1)}T`
  return `$${billions.toFixed(decimals)}B`
}

function NationColumn({ nation }: { nation: Nation }) {
  const eco = nation.economy
  const atWar = nation.atWar.length > 0
  const isIran = nation.id === 'iran'
  const nationColor = nation.id === 'usa' ? 'var(--usa-primary)' : 'var(--iran-primary)'
  const effectiveOil = isIran
    ? eco.oil_revenue_billions * (1 - eco.sanctions_impact)
    : null

  return (
    <div style={{ flex: 1 }}>
      <div style={{
        color: nationColor,
        fontWeight: 600,
        fontSize: 'var(--font-size-sm)',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {nation.id === 'usa' ? 'USA' : 'IRAN'}
      </div>

      <div style={{ marginBottom: 8 }}>
        <Row label="GDP" value={fmt(eco.gdp_billions)} />
        <Row label="Mil Budget" value={fmt(eco.military_budget_billions)} />
        <Row label="Mil % GDP" value={`${eco.military_budget_pct_gdp.toFixed(1)}%`} />
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>
          RESERVES
        </div>
        <StatBar
          label={fmt(eco.reserves_billions, 1)}
          value={eco.reserves_billions}
          max={nation.id === 'usa' ? 1000 : 200}
          color={reserveColor(eco.reserves_billions)}
          showCount={false}
        />
      </div>

      {atWar && (
        <Row
          label="War Cost/day"
          value={`$${eco.war_cost_per_day_millions}M`}
          highlight="var(--status-damaged)"
        />
      )}

      {isIran && (
        <div style={{ marginTop: 6 }}>
          <Row label="Oil Revenue" value={`${fmt(eco.oil_revenue_billions)}/yr`} />
          <Row
            label="Sanctions"
            value={`${(eco.sanctions_impact * 100).toFixed(0)}%`}
            highlight={eco.sanctions_impact > 0.5 ? 'var(--status-damaged)' : 'var(--status-engaged)'}
          />
          {effectiveOil !== null && (
            <Row
              label="Effective Oil"
              value={`${fmt(effectiveOil)}/yr`}
              highlight="var(--text-secondary)"
            />
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: 3,
      fontSize: 'var(--font-size-xs)',
    }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: highlight ?? 'var(--text-primary)', fontWeight: highlight ? 600 : 400 }}>
        {value}
      </span>
    </div>
  )
}

export default function EconomyPanel() {
  const nations = useGameStore(s => s.viewState.nations)

  const usa = nations.find(n => n.id === 'usa')
  const iran = nations.find(n => n.id === 'iran')

  if (!usa || !iran) return null

  return (
    <Panel
      title="ECONOMY"
      style={{
        position: 'absolute',
        bottom: 12,
        left: 340,
        minWidth: 340,
      }}
    >
      <div style={{ display: 'flex', gap: 16 }}>
        <NationColumn nation={usa} />
        <div style={{ width: 1, background: 'var(--border-default)' }} />
        <NationColumn nation={iran} />
      </div>
    </Panel>
  )
}
