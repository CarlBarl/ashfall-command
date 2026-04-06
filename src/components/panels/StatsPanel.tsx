import { useMemo } from 'react'
import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { GameEvent, NationId } from '@/types/game'
import type { ViewUnit, ViewGroundUnit } from '@/types/view'
import { buildFrontlineSummaryMap, type FrontlineSideSummary } from '@/components/map/frontline-utils'

const NATION_COLORS: Record<string, string> = {
  usa: 'var(--usa-primary)',
  iran: 'var(--iran-primary)',
  germany: '#6a85a8',
  poland: '#a88060',
}

function getNationColor(id: string): string {
  return NATION_COLORS[id] ?? 'var(--text-accent)'
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

interface GroundNationStats {
  totalDivisions: number
  destroyedDivisions: number
  avgStrength: number
  avgMorale: number
  attacking: number
  defending: number
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

  const unitIds = new Set(nationUnits.map(u => u.id))
  let missilesLaunched = 0
  let missilesIntercepted = 0

  for (const event of events) {
    if (event.type === 'MISSILE_LAUNCHED' && unitIds.has(event.launcherId)) {
      missilesLaunched++
    }
    if (event.type === 'MISSILE_INTERCEPTED' && unitIds.has(event.interceptorId)) {
      missilesIntercepted++
    }
  }

  return {
    total, destroyed, damaged,
    offensiveMissiles, offensiveMissilesMax,
    samInterceptors, samInterceptorsMax,
    missilesLaunched, missilesIntercepted,
  }
}

function computeGroundStats(groundUnits: ViewGroundUnit[], nationId: NationId): GroundNationStats {
  const nationUnits = groundUnits.filter(u => u.nation === nationId)
  const alive = nationUnits.filter(u => u.status !== 'destroyed')
  return {
    totalDivisions: nationUnits.length,
    destroyedDivisions: nationUnits.filter(u => u.status === 'destroyed').length,
    avgStrength: alive.length > 0 ? alive.reduce((s, u) => s + u.strength, 0) / alive.length : 0,
    avgMorale: alive.length > 0 ? alive.reduce((s, u) => s + u.morale, 0) / alive.length : 0,
    attacking: alive.filter(u => u.stance === 'attack').length,
    defending: alive.filter(u => u.stance === 'defend' || u.stance === 'fortify').length,
  }
}

function ModernNationBlock({ nationId, nationLabel, units, events }: { nationId: NationId; nationLabel: string; units: ViewUnit[]; events: GameEvent[] }) {
  const stats = computeNationStats(units, events, nationId)
  const activeUnits = stats.total - stats.destroyed
  const color = getNationColor(nationId)

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        color,
        fontWeight: 700,
        fontSize: 'var(--font-size-sm)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 6,
        paddingBottom: 4,
        borderBottom: `1px solid ${color}44`,
      }}>
        {nationLabel}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <Stat label="Active" value={activeUnits} color="var(--text-primary)" />
        <Stat label="Damaged" value={stats.damaged} color="var(--status-damaged)" />
        <Stat label="Destroyed" value={stats.destroyed} color="var(--status-destroyed)" />
      </div>

      {stats.offensiveMissilesMax > 0 && (
        <StatBar
          label="Offensive Missiles"
          value={stats.offensiveMissiles}
          max={stats.offensiveMissilesMax}
          color={color}
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

      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
        <Stat label="Fired (offensive)" value={stats.missilesLaunched} color="var(--text-secondary)" />
        <Stat label="Shot down (AD)" value={stats.missilesIntercepted} color="var(--status-ready)" />
        <ExchangeRatio launched={stats.missilesLaunched} intercepted={stats.missilesIntercepted} />
      </div>
    </div>
  )
}

function GroundNationBlock({ nationId, nationLabel, groundUnits }: { nationId: NationId; nationLabel: string; groundUnits: ViewGroundUnit[] }) {
  const stats = computeGroundStats(groundUnits, nationId)
  const activeDivisions = stats.totalDivisions - stats.destroyedDivisions
  const color = getNationColor(nationId)

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        color,
        fontWeight: 700,
        fontSize: 'var(--font-size-sm)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 6,
        paddingBottom: 4,
        borderBottom: `1px solid ${color}44`,
      }}>
        {nationLabel}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <Stat label="Active Div." value={activeDivisions} color="var(--text-primary)" />
        <Stat label="Destroyed" value={stats.destroyedDivisions} color="var(--status-destroyed)" />
        <Stat label="Attacking" value={stats.attacking} color="var(--status-engaged)" />
        <Stat label="Defending" value={stats.defending} color="var(--status-ready)" />
      </div>

      {activeDivisions > 0 && (
        <>
          <StatBar
            label="Avg. Strength"
            value={Math.round(stats.avgStrength)}
            max={100}
            color={stats.avgStrength > 60 ? 'var(--status-ready)' : stats.avgStrength > 30 ? 'var(--status-engaged)' : 'var(--status-damaged)'}
          />
          <StatBar
            label="Avg. Morale"
            value={Math.round(stats.avgMorale)}
            max={100}
            color={stats.avgMorale > 60 ? 'var(--status-ready)' : stats.avgMorale > 30 ? 'var(--status-engaged)' : 'var(--status-damaged)'}
          />
        </>
      )}
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

function FrontlineDetailCard({
  sideA,
  sideB,
  lengthKm,
}: {
  sideA: FrontlineSideSummary
  sideB: FrontlineSideSummary
  lengthKm: number
}) {
  return (
    <div style={{
      marginBottom: 14,
      paddingBottom: 10,
      borderBottom: '1px solid var(--border-default)',
    }}>
      <div style={{
        color: 'var(--text-accent)',
        fontWeight: 700,
        fontSize: 'var(--font-size-sm)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 6,
      }}>
        Frontline Detail
      </div>
      <div style={{ color: 'var(--text-primary)', marginBottom: 8 }}>
        {sideA.nationLabel} vs {sideB.nationLabel}
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <Stat label="Length" value={Math.round(lengthKm)} color="var(--text-accent)" />
        <Stat label={sideA.nationLabel} value={sideA.divisions} color={getNationColor(sideA.nationId)} />
        <Stat label={sideB.nationLabel} value={sideB.divisions} color={getNationColor(sideB.nationId)} />
      </div>
      <FrontlineSideDetail side={sideA} />
      <FrontlineSideDetail side={sideB} />
    </div>
  )
}

function FrontlineSideDetail({ side }: { side: FrontlineSideSummary }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ color: getNationColor(side.nationId), fontWeight: 600, marginBottom: 4 }}>
        {side.nationLabel}
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        <Stat label="Attacking" value={side.attacking} color="var(--status-engaged)" />
        <Stat label="Defending" value={side.defending} color="var(--status-ready)" />
        <Stat label="Morale" value={Math.round(side.avgMorale)} color="var(--text-secondary)" />
      </div>
      <StatBar
        label="Average Strength"
        value={Math.round(side.avgStrength)}
        max={100}
        color={side.avgStrength > 60 ? 'var(--status-ready)' : side.avgStrength > 30 ? 'var(--status-engaged)' : 'var(--status-damaged)'}
      />
      {side.armyGroups.length > 0 && (
        <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)' }}>
          {side.armyGroups.map((group) => (
            <div key={group.id}>
              {group.name}
              {' '}
              ({group.divisionCount})
              {group.generalName ? ` - ${group.generalName}` : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StatsPanel() {
  const units = useGameStore(s => s.viewState.units)
  const nations = useGameStore(s => s.viewState.nations)
  const groundUnits = useGameStore(s => s.viewState.groundUnits)
  const frontlines = useGameStore(s => s.viewState.frontlines)
  const generals = useGameStore(s => s.viewState.generals)
  const armyGroups = useGameStore(s => s.viewState.armyGroups)
  const eventLog = useGameStore(s => s.eventLog)
  const selectedFrontlineId = useUIStore((s) => s.selectedFrontlineId)

  const hasGroundUnits = groundUnits && groundUnits.length > 0
  const hasModernUnits = units.length > 0
  const frontlineSummaries = useMemo(() => buildFrontlineSummaryMap(
    frontlines ?? [],
    groundUnits ?? [],
    armyGroups ?? [],
    generals ?? [],
    nations,
  ), [armyGroups, frontlines, generals, groundUnits, nations])
  const selectedFrontlineSummary = selectedFrontlineId ? frontlineSummaries.get(selectedFrontlineId) ?? null : null

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
      {selectedFrontlineSummary && (
        <FrontlineDetailCard
          sideA={selectedFrontlineSummary.sideA}
          sideB={selectedFrontlineSummary.sideB}
          lengthKm={selectedFrontlineSummary.lengthKm}
        />
      )}
      {nations.map(nation => hasGroundUnits ? (
        <GroundNationBlock
          key={nation.id}
          nationId={nation.id as NationId}
          nationLabel={nation.name}
          groundUnits={groundUnits}
        />
      ) : hasModernUnits ? (
        <ModernNationBlock
          key={nation.id}
          nationId={nation.id as NationId}
          nationLabel={nation.name}
          units={units}
          events={eventLog}
        />
      ) : null)}
    </Panel>
  )
}
