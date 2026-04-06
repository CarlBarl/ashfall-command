import { useMemo } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { ViewUnit } from '@/types/view'
import type { Missile } from '@/types/game'
import type { FrontlineSideSummary, FrontlineSummary } from './frontline-utils'
import { buildFrontlineSummaryMap } from './frontline-utils'

interface InfoTooltipProps {
  x: number
  y: number
}

export default function InfoTooltip({ x, y }: InfoTooltipProps) {
  const hoveredId = useUIStore((s) => s.hoveredUnitId)
  const hoveredFrontlineId = useUIStore((s) => s.hoveredFrontlineId)
  const units = useGameStore((s) => s.viewState.units)
  const missiles = useGameStore((s) => s.viewState.missiles)
  const frontlines = useGameStore((s) => s.viewState.frontlines)
  const groundUnits = useGameStore((s) => s.viewState.groundUnits)
  const generals = useGameStore((s) => s.viewState.generals)
  const armyGroups = useGameStore((s) => s.viewState.armyGroups)
  const nations = useGameStore((s) => s.viewState.nations)

  const frontlineSummaries = useMemo(() => buildFrontlineSummaryMap(
    frontlines ?? [],
    groundUnits ?? [],
    armyGroups ?? [],
    generals ?? [],
    nations,
  ), [armyGroups, frontlines, generals, groundUnits, nations])

  if (hoveredId) {
    const unit = units.find(u => u.id === hoveredId)
    if (unit) return <UnitTooltip unit={unit} x={x} y={y} />

    const missile = missiles.find(m => m.id === hoveredId)
    if (missile) return <MissileTooltipView missile={missile} x={x} y={y} />
  }

  if (hoveredFrontlineId) {
    const summary = frontlineSummaries.get(hoveredFrontlineId)
    if (summary) return <FrontlineTooltip summary={summary} x={x} y={y} />
  }

  return null
}

function MissileTooltipView({ missile, x, y }: { missile: Missile; x: number; y: number }) {
  const spec = weaponSpecs[missile.weaponId]
  const time = useGameStore((s) => s.viewState.time)
  const remainingMs = missile.eta - time.timestamp
  const remainingSec = Math.max(0, Math.round(remainingMs / 1000))
  const remainingStr = remainingSec > 60
    ? `${Math.floor(remainingSec / 60)}m ${remainingSec % 60}s`
    : `${remainingSec}s`

  const speedKmh = spec ? spec.speed_mach * 1235 : 0

  return (
    <div style={tooltipStyle(x, y)}>
      <div style={headerStyle}>{spec?.name ?? missile.weaponId}</div>
      <Row label="Type" value={spec?.type.replace(/_/g, ' ') ?? '?'} />
      <Row label="Speed" value={`Mach ${spec?.speed_mach} (${Math.round(speedKmh)} km/h)`} />
      <Row label="Altitude" value={`${Math.round(missile.altitude_m)} m`} highlight />
      <Row label="Phase" value={missile.phase.toUpperCase()} highlight />
      <Row label="Warhead" value={`${spec?.warhead_kg ?? '?'} kg`} />
      <Row label="CEP" value={`${spec?.cep_m ?? '?'} m`} />
      <Row label="Guidance" value={spec?.guidance ?? '?'} />
      <Row label="ETA" value={remainingSec > 0 ? remainingStr : 'IMPACT'} highlight />
      <Row label="Launcher" value={missile.launcherId} />
      <Row label="Target" value={missile.targetId} />
    </div>
  )
}

function UnitTooltip({ unit, x, y }: { unit: ViewUnit; x: number; y: number }) {
  return (
    <div style={tooltipStyle(x, y)}>
      <div style={headerStyle}>{unit.name}</div>
      <Row label="Nation" value={unit.nation.toUpperCase()} />
      <Row label="Type" value={unit.category.replace(/_/g, ' ')} />
      <Row label="Status" value={unit.status} highlight />
      <Row label="Health" value={`${unit.health}%`} highlight />
      <Row label="ROE" value={unit.roe.replace(/_/g, ' ')} />
      {unit.speed_kts > 0 && <Row label="Speed" value={`${unit.speed_kts} kts`} />}
      {unit.weapons.length > 0 && (
        <>
          <div style={{ borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
          {unit.weapons.map(w => {
            const spec = weaponSpecs[w.weaponId]
            return (
              <Row
                key={w.weaponId}
                label={spec?.name ?? w.weaponId}
                value={`${w.count}/${w.maxCount}`}
              />
            )
          })}
        </>
      )}
    </div>
  )
}

function FrontlineTooltip({
  summary,
  x,
  y,
}: {
  summary: FrontlineSummary
  x: number
  y: number
}) {
  return (
    <div style={tooltipStyle(x, y)}>
      <div style={headerStyle}>
        {summary.sideA.nationLabel} vs {summary.sideB.nationLabel}
      </div>
      <Row label="Front Length" value={`${Math.round(summary.lengthKm)} km`} highlight />
      <div style={{ borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
      <FrontlineSideBlock side={summary.sideA} />
      <div style={{ borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
      <FrontlineSideBlock side={summary.sideB} />
    </div>
  )
}

function FrontlineSideBlock({
  side,
}: {
  side: FrontlineSideSummary
}) {
  const leadGroup = side.armyGroups[0]

  return (
    <>
      <div style={{ color: 'var(--text-accent)', fontWeight: 600, marginBottom: 2 }}>
        {side.nationLabel}
      </div>
      <Row label="Nearby Divisions" value={`${side.divisions}`} highlight />
      <Row label="Posture" value={`${side.attacking} ATK / ${side.defending} DEF`} />
      <Row label="Avg Strength" value={`${Math.round(side.avgStrength)}%`} />
      <Row label="Avg Morale" value={`${Math.round(side.avgMorale)}%`} />
      {leadGroup && (
        <Row
          label="Lead Group"
          value={leadGroup.generalName ? `${leadGroup.name} / ${leadGroup.generalName}` : leadGroup.name}
        />
      )}
    </>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '1px 0' }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: highlight ? 'var(--text-accent)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

function tooltipStyle(x: number, y: number): React.CSSProperties {
  return {
    position: 'fixed',
    left: x + 16,
    top: y - 8,
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--panel-radius)',
    padding: '6px 10px',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--text-primary)',
    zIndex: 50,
    pointerEvents: 'none',
    minWidth: 180,
    maxWidth: 280,
    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  }
}

const headerStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 'var(--font-size-sm)',
  color: 'var(--text-accent)',
  marginBottom: 4,
  paddingBottom: 3,
  borderBottom: '1px solid var(--border-default)',
}
