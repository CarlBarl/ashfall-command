import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useGameStore } from '@/store/game-store'
import type { Nation } from '@/types/game'

const NATION_COLORS: Record<string, string> = {
  usa: 'var(--usa-primary)',
  iran: 'var(--iran-primary)',
  germany: '#6a85a8',
  poland: '#a88060',
}

function reserveColor(reserves: number): string {
  if (reserves > 50) return 'var(--status-ready)'
  if (reserves > 10) return 'var(--status-engaged)'
  return 'var(--status-damaged)'
}

function fmt(value: number, decimals = 0): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}T`
  return `${value.toFixed(decimals)}B`
}

function NationColumn({ nation }: { nation: Nation }) {
  const eco = nation.economy
  const atWar = nation.atWar.length > 0
  const nationColor = NATION_COLORS[nation.id] ?? 'var(--text-accent)'
  const hasOil = eco.oil_revenue_billions != null && eco.oil_revenue_billions > 0
  const hasSanctions = eco.sanctions_impact != null && eco.sanctions_impact > 0

  // Determine currency label from the economy (default to $)
  const currency = eco.currency ?? '$'
  const fmtC = (v: number, d = 0) => `${currency}${fmt(v, d)}`

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
        {nation.name}
      </div>

      <div style={{ marginBottom: 8 }}>
        <Row label="GDP" value={fmtC(eco.gdp_billions)} />
        <Row label="Mil Budget" value={fmtC(eco.military_budget_billions)} />
        <Row label="Mil % GDP" value={`${eco.military_budget_pct_gdp.toFixed(1)}%`} />
      </div>

      <div style={{ marginBottom: 6 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)', marginBottom: 4 }}>
          RESERVES
        </div>
        <StatBar
          label={fmtC(eco.reserves_billions, 1)}
          value={eco.reserves_billions}
          max={Math.max(eco.reserves_billions * 2, 100)}
          color={reserveColor(eco.reserves_billions)}
          showCount={false}
        />
      </div>

      {atWar && (
        <Row
          label="War Cost/day"
          value={`${currency}${eco.war_cost_per_day_millions}M`}
          highlight="var(--status-damaged)"
        />
      )}

      {hasOil && (
        <div style={{ marginTop: 6 }}>
          <Row label="Oil Revenue" value={`${fmtC(eco.oil_revenue_billions)}/yr`} />
          {hasSanctions && (
            <>
              <Row
                label="Sanctions"
                value={`${(eco.sanctions_impact * 100).toFixed(0)}%`}
                highlight={eco.sanctions_impact > 0.5 ? 'var(--status-damaged)' : 'var(--status-engaged)'}
              />
              <Row
                label="Effective Oil"
                value={`${fmtC(eco.oil_revenue_billions * (1 - eco.sanctions_impact))}/yr`}
                highlight="var(--text-secondary)"
              />
            </>
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

  if (nations.length === 0) return null

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
        {nations.map((nation, i) => (
          <div key={nation.id} style={{ display: 'contents' }}>
            {i > 0 && <div style={{ width: 1, background: 'var(--border-default)' }} />}
            <NationColumn nation={nation} />
          </div>
        ))}
      </div>
    </Panel>
  )
}
