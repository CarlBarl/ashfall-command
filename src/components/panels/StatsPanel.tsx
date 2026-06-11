import type { CSSProperties } from 'react'
import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useGameStore } from '@/store/game-store'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { GameEvent, NationId } from '@/types/game'
import type { ViewUnit } from '@/types/view'

const NATION_COLORS: Record<string, string> = {
  usa: 'var(--usa-primary)',
  iran: 'var(--iran-primary)',
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
  missilesIncoming: number
  missilesIntercepted: number
}

function isSAM(weaponId: string): boolean {
  const spec = weaponSpecs[weaponId]
  return spec?.type === 'sam'
}

export function computeNationStats(
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
  let missilesIncoming = 0
  let missilesIntercepted = 0

  for (const event of events) {
    if (event.type === 'MISSILE_LAUNCHED') {
      if (unitIds.has(event.launcherId)) missilesLaunched++
      if (unitIds.has(event.targetId)) missilesIncoming++
    }
    if (event.type === 'MISSILE_INTERCEPTED' && unitIds.has(event.interceptorId)) {
      missilesIntercepted++
    }
  }

  return {
    total, destroyed, damaged,
    offensiveMissiles, offensiveMissilesMax,
    samInterceptors, samInterceptorsMax,
    missilesLaunched, missilesIncoming, missilesIntercepted,
  }
}

export interface ArsenalRow {
  weaponId: string
  name: string
  deployed: number
  deployedMax: number
  reserve: number
  prodPerHour: number
}

/** Per-weapon national arsenal: loaded on units + reserve at bases + industry rate */
export function computeArsenal(units: ViewUnit[], nationId: NationId): ArsenalRow[] {
  const rows = new Map<string, ArsenalRow>()
  const row = (weaponId: string): ArsenalRow => {
    let r = rows.get(weaponId)
    if (!r) {
      r = {
        weaponId,
        name: weaponSpecs[weaponId]?.name ?? weaponId,
        deployed: 0,
        deployedMax: 0,
        reserve: 0,
        prodPerHour: 0,
      }
      rows.set(weaponId, r)
    }
    return r
  }

  for (const unit of units) {
    if (unit.nation !== nationId || unit.status === 'destroyed') continue
    for (const w of unit.weapons) {
      const r = row(w.weaponId)
      r.deployed += w.count
      r.deployedMax += w.maxCount
    }
    for (const s of unit.supplyStocks) {
      const r = row(s.weaponId)
      r.reserve += s.count
      r.prodPerHour += s.productionRate
    }
  }

  return Array.from(rows.values()).sort(
    (a, b) => (b.deployed + b.reserve) - (a.deployed + a.reserve),
  )
}

function ArsenalTable({ units, nationId }: { units: ViewUnit[]; nationId: NationId }) {
  const rows = computeArsenal(units, nationId)
  if (rows.length === 0) return null
  const totalProd = rows.reduce((sum, r) => sum + r.prodPerHour, 0)

  const cell: CSSProperties = {
    fontSize: 'var(--font-size-xs)',
    fontFamily: 'var(--font-mono)',
    padding: '1px 4px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 6,
        borderBottom: '1px solid var(--border-default)',
        marginBottom: 2,
        paddingBottom: 2,
      }}>
        <span style={{
          color: 'var(--text-secondary)',
          fontWeight: 700,
          fontSize: 'var(--font-size-xs)',
          letterSpacing: '0.06em',
        }}>
          ARSENAL
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: totalProd > 0 ? 'var(--status-ready)' : 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
          INDUSTRY {totalProd > 0 ? `+${formatRate(totalProd)}/h` : 'IDLE'}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left', color: 'var(--text-muted)', fontWeight: 400 }}>TYPE</th>
            <th style={{ ...cell, color: 'var(--text-muted)', fontWeight: 400 }}>LOADED</th>
            <th style={{ ...cell, color: 'var(--text-muted)', fontWeight: 400 }}>RESERVE</th>
            <th style={{ ...cell, color: 'var(--text-muted)', fontWeight: 400 }}>IND.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.weaponId}>
              <td style={{
                ...cell,
                textAlign: 'left',
                color: 'var(--text-primary)',
                maxWidth: 110,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {r.name}
              </td>
              <td style={{
                ...cell,
                color: r.deployed === 0 ? 'var(--status-damaged)'
                  : r.deployed < r.deployedMax * 0.25 ? 'var(--status-engaged)'
                    : 'var(--text-primary)',
              }}>
                {r.deployed}/{r.deployedMax}
              </td>
              <td style={{ ...cell, color: r.reserve > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                {r.reserve}
              </td>
              <td style={{ ...cell, color: r.prodPerHour > 0 ? 'var(--status-ready)' : 'var(--text-muted)' }}>
                {r.prodPerHour > 0 ? `+${formatRate(r.prodPerHour)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatRate(rate: number): string {
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(1)
}

function ModernNationBlock({ nationId, nationLabel, units, events, isPlayer }: { nationId: NationId; nationLabel: string; units: ViewUnit[]; events: GameEvent[]; isPlayer: boolean }) {
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
        borderBottom: `1px solid color-mix(in srgb, ${color} 27%, transparent)`,
      }}>
        {nationLabel}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <Stat label={isPlayer ? 'Active' : 'Contacts'} value={activeUnits} color="var(--text-primary)" />
        <Stat label="Damaged" value={stats.damaged} color="var(--status-damaged)" />
        <Stat label="Destroyed" value={stats.destroyed} color="var(--status-destroyed)" />
      </div>

      {isPlayer ? (
        <>
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
          <ArsenalTable units={units} nationId={nationId} />
        </>
      ) : (
        // Enemy inventories are not knowable under fog — known contacts only
        <div style={{
          color: 'var(--text-muted)',
          fontSize: 'var(--font-size-xs)',
          letterSpacing: '0.05em',
          margin: '2px 0 4px',
        }}>
          EST. ORBAT: {activeUnits} {activeUnits === 1 ? 'contact' : 'contacts'}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
        <Stat label="Fired (offensive)" value={stats.missilesLaunched} color="var(--text-secondary)" />
        <Stat label="Shot down (AD)" value={stats.missilesIntercepted} color="var(--status-ready)" />
        <ExchangeRatio incoming={stats.missilesIncoming} intercepted={stats.missilesIntercepted} />
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

function ExchangeRatio({ incoming, intercepted }: { incoming: number; intercepted: number }) {
  if (incoming === 0) return null
  const pct = Math.round((intercepted / incoming) * 100)
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
  const nations = useGameStore(s => s.viewState.nations)
  const playerNation = useGameStore(s => s.viewState.playerNation)
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
      {nations.map(nation => (
        <ModernNationBlock
          key={nation.id}
          nationId={nation.id as NationId}
          nationLabel={nation.name}
          units={units}
          events={eventLog}
          isPlayer={nation.id === playerNation}
        />
      ))}
    </Panel>
  )
}
