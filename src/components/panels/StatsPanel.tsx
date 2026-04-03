import {} from 'react'
import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useGameStore } from '@/store/game-store'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { GameEvent, NationId } from '@/types/game'
import type { ViewUnit } from '@/types/view'

const NATIONS: NationId[] = ['usa', 'iran']

const NATION_LABELS: Record<NationId, string> = {
  usa: 'United States',
  iran: 'Iran',
}

const NATION_COLORS: Record<NationId, string> = {
  usa: 'var(--usa-primary)',
  iran: 'var(--iran-primary)',
}

interface NationStats {
  total: number
  destroyed: number
  damaged: number
  offensiveMissiles: number
  offensiveMissilesMax: number
  samInterceptors: number
  samInterceptorsMax: number
  missilesLaunched: number
  missilesIntercepted: number
}

function isSAM(weaponId: string): boolean {
  const spec = weaponSpecs[weaponId]
  return spec?.type === 'sam'
}

function computeNationStats(
  units: ViewUnit[],
  events: GameEvent[],
  nationId: NationId,
): NationStats {
  const nationUnits = units.filter(u => u.nation === nationId)
  const total = nationUnits.length
  const destroyed = nationUnits.filter(u => u.status === 'destroyed').length
  const damaged = nationUnits.filter(u => u.status === 'damaged').length

  let offensiveMissiles = 0
  let offensiveMissilesMax = 0
  let samInterceptors = 0
  let samInterceptorsMax = 0

  for (const unit of nationUnits) {
    for (const w of unit.weapons) {
      if (isSAM(w.weaponId)) {
        samInterceptors += w.count
        samInterceptorsMax += w.maxCount
      } else {
        offensiveMissiles += w.count
        offensiveMissilesMax += w.maxCount
      }
    }
  }

  // We need to find which unit IDs belong to this nation for event attribution.
  // MISSILE_LAUNCHED carries launcherId; we match launcherId against nation units.
  const unitIds = new Set(nationUnits.map(u => u.id))

  let missilesLaunched = 0
  let missilesIntercepted = 0

  for (const event of events) {
    if (event.type === 'MISSILE_LAUNCHED' && unitIds.has(event.launcherId)) {
      missilesLaunched++
    }
    // Intercepts are credited to the intercepting unit's nation
    if (event.type === 'MISSILE_INTERCEPTED' && unitIds.has(event.interceptorId)) {
      missilesIntercepted++
    }
  }

  return {
    total,
    destroyed,
    damaged,
    offensiveMissiles,
    offensiveMissilesMax,
    samInterceptors,
    samInterceptorsMax,
    missilesLaunched,
    missilesIntercepted,
  }
}

function NationStatsBlock({ nationId, units, events }: { nationId: NationId; units: ViewUnit[]; events: GameEvent[] }) {
  const stats = computeNationStats(units, events, nationId)
  const activeUnits = stats.total - stats.destroyed

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        color: NATION_COLORS[nationId],
        fontWeight: 700,
        fontSize: 'var(--font-size-sm)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 6,
        paddingBottom: 4,
        borderBottom: `1px solid ${NATION_COLORS[nationId]}44`,
      }}>
        {NATION_LABELS[nationId]}
      </div>

      {/* Unit counts */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <Stat label="Active" value={activeUnits} color="var(--text-primary)" />
        <Stat label="Damaged" value={stats.damaged} color="var(--status-damaged)" />
        <Stat label="Destroyed" value={stats.destroyed} color="var(--status-destroyed)" />
      </div>

      {/* Ammo bars */}
      {stats.offensiveMissilesMax > 0 && (
        <StatBar
          label="Offensive Missiles"
          value={stats.offensiveMissiles}
          max={stats.offensiveMissilesMax}
          color={NATION_COLORS[nationId]}
        />
      )}
      {stats.samInterceptorsMax > 0 && (
        <StatBar
          label="SAM Interceptors"
          value={stats.samInterceptors}
          max={stats.samInterceptorsMax}
          color="var(--status-ready)"
        />
      )}

      {/* Exchange stats */}
      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
        <Stat label="Fired (offensive)" value={stats.missilesLaunched} color="var(--text-secondary)" />
        <Stat label="Shot down (AD)" value={stats.missilesIntercepted} color="var(--status-ready)" />
        <ExchangeRatio launched={stats.missilesLaunched} intercepted={stats.missilesIntercepted} />
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 }}>
      <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>{label}</span>
    </div>
  )
}

function ExchangeRatio({ launched, intercepted }: { launched: number; intercepted: number }) {
  if (launched === 0) return null
  const pct = Math.round((intercepted / launched) * 100)
  const color = pct >= 70 ? 'var(--status-ready)' : pct >= 40 ? 'var(--status-engaged)' : 'var(--status-damaged)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 48 }}>
      <span style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color }}>{pct}%</span>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>Int. Rate</span>
    </div>
  )
}

export default function StatsPanel() {
  const units = useGameStore(s => s.viewState.units)
  const eventLog = useGameStore(s => s.eventLog)

  return (
    <Panel
      title="SITUATION REPORT"
      style={{
        position: 'absolute',
        top: 44,
        left: 290,
        maxHeight: '60vh',
        minWidth: 260,
        overflowY: 'auto',
      }}
    >
      {NATIONS.map(nationId => (
        <NationStatsBlock
          key={nationId}
          nationId={nationId}
          units={units}
          events={eventLog}
        />
      ))}
    </Panel>
  )
}
