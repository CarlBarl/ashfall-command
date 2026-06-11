import { useMemo, useState, type CSSProperties } from 'react'
import Panel from '@/components/common/Panel'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import { AIRFRAMES } from '@/data/air/airframes'
import type { AirMission, AirMissionKind, Position, SquadronState } from '@/types/game'
import type { ViewUnit } from '@/types/view'

const KINDS: { id: AirMissionKind; label: string; color: string }[] = [
  { id: 'cap', label: 'CAP', color: 'var(--text-accent)' },
  { id: 'strike', label: 'STRIKE', color: 'var(--status-damaged)' },
  { id: 'aew', label: 'AEW', color: 'var(--text-primary)' },
]

const STRAIT_STATION: Position = { lat: 26.6, lng: 56.5 }

const CARD: CSSProperties = {
  border: '1px solid var(--border-default)',
  borderRadius: 4,
  padding: '6px 8px',
  marginBottom: 6,
  background: 'var(--bar-bg)',
}

const SECTION_HEADER: CSSProperties = {
  color: 'var(--text-accent)',
  fontWeight: 700,
  fontSize: 'var(--font-size-xs)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  padding: '4px 0',
  borderBottom: '1px solid var(--border-default)',
  marginBottom: 6,
  userSelect: 'none',
}

const BTN: CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--border-default)',
  borderRadius: 3,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.55rem',
  padding: '3px 8px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
}

const SELECT: CSSProperties = {
  background: 'var(--bg-hover)',
  border: '1px solid var(--border-default)',
  borderRadius: 3,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.6rem',
  padding: '3px 4px',
  width: '100%',
}

const INPUT: CSSProperties = { ...SELECT, width: 80 }

const LABEL: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.5rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
}

const MUTED_XS: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.55rem',
  lineHeight: 1.4,
}

const HINT: CSSProperties = { ...MUTED_XS, fontStyle: 'italic', padding: '2px 0' }

function fmtTicks(ticks: number): string {
  const t = Math.max(0, Math.round(ticks))
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

function availColor(available: number, total: number): string {
  if (available < 2) return 'var(--status-damaged)'
  if (total > 0 && available / total < 0.5) return 'var(--status-engaged)'
  return 'var(--status-ready)'
}

function airframeShortName(squadron: SquadronState | undefined): string {
  if (!squadron) return '?'
  const spec = AIRFRAMES[squadron.airframe]
  return spec ? spec.name.split(' ')[0] : squadron.airframe
}

export default function AirOpsPanel({ onClose }: { onClose?: () => void }) {
  const toggleAirOps = useUIStore((s) => s.toggleAirOps)
  const units = useGameStore((s) => s.viewState.units)
  const playerNation = useGameStore((s) => s.viewState.playerNation)
  const tick = useGameStore((s) => s.viewState.time.tick)
  const missions = useGameStore((s) => s.viewState.airMissions)
  const surgeOps = useGameStore((s) => s.viewState.surgeOps) ?? false

  const [kind, setKind] = useState<AirMissionKind>('cap')
  const [squadronSel, setSquadronSel] = useState('')
  const [flightSize, setFlightSize] = useState(2)
  const [targetSel, setTargetSel] = useState('')
  const [stationSel, setStationSel] = useState('strait')
  const [customLat, setCustomLat] = useState('26.6')
  const [customLng, setCustomLng] = useState('56.5')
  const [sead, setSead] = useState(false)
  const [extRange, setExtRange] = useState(false)

  const hosts = useMemo(
    () => units.filter((u) => u.nation === playerNation && u.status !== 'destroyed' && (u.airWing?.length ?? 0) > 0),
    [units, playerNation],
  )

  const squadronIndex = useMemo(() => {
    const map = new Map<string, { host: ViewUnit; squadron: SquadronState }>()
    for (const host of hosts) {
      for (const squadron of host.airWing ?? []) map.set(squadron.id, { host, squadron })
    }
    return map
  }, [hosts])

  // Aborted missions stay listed while their flight is still airborne (RTB)
  const visibleMissions = useMemo(
    () => (missions ?? []).filter((m) =>
      m.status === 'planning' || m.status === 'active'
      || (m.status === 'aborted' && m.flightUnitId !== undefined && units.some((u) => u.id === m.flightUnitId && u.status !== 'destroyed'))),
    [missions, units],
  )

  const eligible = useMemo(() => hosts.flatMap((host) => (host.airWing ?? [])
    .filter((sq) => {
      const spec = AIRFRAMES[sq.airframe]
      if (!spec) return false
      if (kind === 'strike') return spec.strikeWeapons.length > 0
      if (kind === 'aew') return spec.datalink_range_km !== undefined
      return true
    })
    .map((squadron) => ({ host, squadron }))), [hosts, kind])

  const squadronValue = eligible.some((e) => `${e.host.id}|${e.squadron.id}` === squadronSel) ? squadronSel : ''
  const selected = squadronValue === ''
    ? undefined
    : eligible.find((e) => `${e.host.id}|${e.squadron.id}` === squadronValue)

  const strikeTargets = useMemo(() => units.filter((u) =>
    u.nation !== playerNation && u.status !== 'destroyed'
    && (u.visibility === 'tracked' || u.visibility === 'identified' || u.category === 'airbase' || u.category === 'naval_base')),
    [units, playerNation])

  const targetValue = strikeTargets.some((t) => t.id === targetSel) ? targetSel : ''

  const station: Position | null = (() => {
    if (stationSel === 'strait') return STRAIT_STATION
    if (stationSel.startsWith('unit|')) {
      const u = units.find((x) => x.id === stationSel.slice(5))
      return u ? { lat: u.position.lat, lng: u.position.lng } : null
    }
    const lat = Number(customLat)
    const lng = Number(customLng)
    return customLat.trim() !== '' && customLng.trim() !== '' && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : null
  })()

  const isUsa = playerNation === 'usa'
  const canLaunch = selected !== undefined
    && selected.squadron.available >= flightSize
    && (kind === 'strike' ? targetValue !== '' : station !== null)

  const handleLaunch = () => {
    if (!selected) return
    const base = {
      type: 'LAUNCH_AIR_MISSION' as const,
      kind,
      squadronId: selected.squadron.id,
      fromUnitId: selected.host.id,
      flightSize,
      ...(isUsa && sead ? { escortSead: true } : {}),
      ...(isUsa && extRange ? { extendedRange: true } : {}),
    }
    if (kind === 'strike') {
      if (targetValue === '') return
      sendCommand({ ...base, targetId: targetValue })
    } else {
      if (!station) return
      sendCommand({ ...base, station })
    }
  }

  return (
    <Panel
      title="AIR OPERATIONS"
      onClose={onClose ?? toggleAirOps}
      style={{
        position: 'absolute',
        top: 44,
        left: 290,
        width: 360,
        maxHeight: '72vh',
        overflowY: 'auto',
      }}
    >
      {/* Squadron pools per host */}
      <div style={SECTION_HEADER}>SQUADRONS</div>
      {hosts.length === 0 && <div style={HINT}>NO AIR WINGS IN THEATER</div>}
      {hosts.map((host) => (
        <div key={host.id} style={CARD}>
          <div style={{
            color: 'var(--text-primary)',
            fontWeight: 700,
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: 4,
          }}>
            {host.name}
          </div>
          {(host.airWing ?? []).map((sq) => (
            <SquadronRow key={sq.id} squadron={sq} tick={tick} />
          ))}
        </div>
      ))}

      {/* Live mission board */}
      <div style={SECTION_HEADER}>ACTIVE MISSIONS</div>
      {visibleMissions.length === 0 && <div style={HINT}>NO ACTIVE MISSIONS</div>}
      {visibleMissions.map((m) => (
        <MissionRow key={m.id} mission={m} tick={tick} squadronIndex={squadronIndex} />
      ))}

      {/* Composer */}
      <div style={SECTION_HEADER}>MISSION COMPOSER</div>
      <div style={CARD}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          {KINDS.map((k) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              style={{
                ...BTN,
                flex: 1,
                color: kind === k.id ? 'var(--bg-primary)' : k.color,
                background: kind === k.id ? k.color : 'var(--bg-hover)',
                border: `1px solid ${k.color}`,
                fontWeight: 700,
              }}
            >
              {k.label}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 6 }}>
          <div style={{ ...LABEL, marginBottom: 2 }}>SQUADRON</div>
          <select
            aria-label="Squadron"
            value={squadronValue}
            onChange={(e) => setSquadronSel(e.target.value)}
            style={SELECT}
          >
            <option value="">SELECT SQUADRON</option>
            {eligible.map(({ host, squadron }) => (
              <option key={`${host.id}|${squadron.id}`} value={`${host.id}|${squadron.id}`}>
                {squadron.name} · {airframeShortName(squadron)} · {squadron.available} RDY · {host.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
          <span style={LABEL}>FLIGHT SIZE</span>
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              aria-label={`Flight size ${n}`}
              onClick={() => setFlightSize(n)}
              style={{
                ...BTN,
                padding: '3px 10px',
                color: flightSize === n ? 'var(--text-accent)' : 'var(--text-secondary)',
                border: `1px solid ${flightSize === n ? 'var(--border-accent)' : 'var(--border-default)'}`,
                fontWeight: flightSize === n ? 700 : 600,
              }}
            >
              {n}
            </button>
          ))}
        </div>

        {kind === 'strike' ? (
          <div style={{ marginBottom: 6 }}>
            <div style={{ ...LABEL, marginBottom: 2 }}>TARGET</div>
            <select
              aria-label="Target"
              value={targetValue}
              onChange={(e) => setTargetSel(e.target.value)}
              style={SELECT}
            >
              <option value="">SELECT TARGET</option>
              {strikeTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.visibility.toUpperCase()}
                </option>
              ))}
            </select>
            {strikeTargets.length === 0 && <div style={HINT}>NO TRACKED CONTACTS OR FIXED SITES</div>}
          </div>
        ) : (
          <div style={{ marginBottom: 6 }}>
            <div style={{ ...LABEL, marginBottom: 2 }}>STATION</div>
            <select
              aria-label="Station"
              value={stationSel}
              onChange={(e) => setStationSel(e.target.value)}
              style={SELECT}
            >
              {hosts.map((h) => (
                <option key={h.id} value={`unit|${h.id}`}>OVER {h.name.toUpperCase()}</option>
              ))}
              <option value="strait">STRAIT MIDPOINT 26.6N 56.5E</option>
              <option value="custom">CUSTOM LAT/LNG</option>
            </select>
            {stationSel === 'custom' && (
              <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
                <span style={LABEL}>LAT</span>
                <input
                  aria-label="Station latitude"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  style={INPUT}
                />
                <span style={LABEL}>LNG</span>
                <input
                  aria-label="Station longitude"
                  value={customLng}
                  onChange={(e) => setCustomLng(e.target.value)}
                  style={INPUT}
                />
              </div>
            )}
          </div>
        )}

        {isUsa && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
            <label style={{ ...MUTED_XS, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                aria-label="SEAD escort"
                checked={sead}
                onChange={(e) => setSead(e.target.checked)}
              />
              SEAD ESCORT
            </label>
            <label style={{ ...MUTED_XS, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                aria-label="Extended range"
                checked={extRange}
                onChange={(e) => setExtRange(e.target.checked)}
              />
              EXTENDED RANGE
            </label>
          </div>
        )}

        <button
          onClick={handleLaunch}
          disabled={!canLaunch}
          style={{
            ...BTN,
            width: '100%',
            padding: '5px 8px',
            color: canLaunch ? 'var(--bg-primary)' : 'var(--text-muted)',
            background: canLaunch ? 'var(--status-ready)' : 'var(--bg-hover)',
            border: `1px solid ${canLaunch ? 'var(--status-ready)' : 'var(--border-default)'}`,
            fontWeight: 700,
            cursor: canLaunch ? 'pointer' : 'default',
            opacity: canLaunch ? 1 : 0.6,
          }}
        >
          LAUNCH MISSION
        </button>
        {selected !== undefined && selected.squadron.available < flightSize && (
          <div style={{ ...HINT, color: 'var(--status-damaged)' }}>INSUFFICIENT READY AIRFRAMES</div>
        )}
      </div>

      {/* Surge lever */}
      <div style={SECTION_HEADER}>SURGE OPS</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => sendCommand({ type: 'SET_SURGE_OPS', enabled: !surgeOps })}
          style={{
            ...BTN,
            flexShrink: 0,
            color: surgeOps ? 'var(--bg-primary)' : 'var(--status-engaged)',
            background: surgeOps ? 'var(--status-engaged)' : 'var(--bg-hover)',
            border: '1px solid var(--status-engaged)',
            fontWeight: 700,
          }}
        >
          SURGE OPS: {surgeOps ? 'ON' : 'OFF'}
        </button>
        <span style={MUTED_XS}>96h halved ready times, then ×1.5 sustained</span>
      </div>
    </Panel>
  )
}

function SquadronRow({ squadron, tick }: { squadron: SquadronState; tick: number }) {
  const spec = AIRFRAMES[squadron.airframe]
  const future = squadron.readyAt.filter((t) => t > tick)
  const nextIn = future.length > 0 ? Math.min(...future) - tick : null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, padding: '2px 0' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: '0.6rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {squadron.name}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem' }}>
          {spec?.name ?? squadron.airframe}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ color: availColor(squadron.available, squadron.total), fontWeight: 700, fontSize: '0.6rem' }}>
          {squadron.available}/{squadron.total}
        </div>
        {nextIn !== null && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.5rem', whiteSpace: 'nowrap' }}>
            NEXT +{fmtTicks(nextIn)}
          </div>
        )}
      </div>
    </div>
  )
}

function MissionRow({
  mission,
  tick,
  squadronIndex,
}: {
  mission: AirMission
  tick: number
  squadronIndex: Map<string, { host: ViewUnit; squadron: SquadronState }>
}) {
  const entry = squadronIndex.get(mission.squadronId)
  const kindMeta = KINDS.find((k) => k.id === mission.kind)
  const cancellable = mission.status === 'planning' || mission.status === 'active'
  const statusText = mission.status === 'planning' && mission.planningCompleteTick !== undefined
    ? `PLANNING T-${fmtTicks(mission.planningCompleteTick - tick)}`
    : mission.status.toUpperCase()
  const statusColor = mission.status === 'active'
    ? 'var(--status-ready)'
    : mission.status === 'planning' ? 'var(--status-engaged)' : 'var(--text-muted)'

  return (
    <div style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        color: kindMeta?.color ?? 'var(--text-secondary)',
        border: `1px solid ${kindMeta?.color ?? 'var(--border-default)'}`,
        borderRadius: 3,
        padding: '1px 4px',
        fontSize: '0.5rem',
        fontWeight: 700,
        flexShrink: 0,
      }}>
        {mission.kind.toUpperCase()}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: 'var(--text-primary)', fontSize: '0.6rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {mission.flightSize}× {airframeShortName(entry?.squadron)}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.5rem', whiteSpace: 'nowrap' }}>
          {entry?.squadron.name ?? mission.squadronId}
        </div>
      </div>
      <span style={{ color: statusColor, fontSize: '0.55rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
        {statusText}
      </span>
      {cancellable && (
        <button
          onClick={() => sendCommand({ type: 'CANCEL_AIR_MISSION', missionId: mission.id })}
          style={{ ...BTN, color: 'var(--status-damaged)', borderColor: 'var(--status-damaged)', flexShrink: 0 }}
        >
          CANCEL
        </button>
      )}
    </div>
  )
}
