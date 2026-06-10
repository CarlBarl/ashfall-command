import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '@/store/game-store'
import { useUIStore } from '@/store/ui-store'
import { sendCommand } from '@/store/bridge'
import { useIsMobile } from '@/hooks/useIsMobile'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { GameEvent, Position } from '@/types/game'
import type { AutoPauseSettings } from '@/store/ui-store'

/** How long (ms) after the last new event before auto-collapsing */
const AUTO_COLLAPSE_MS = 10_000

/** Logistics churn — one RESUPPLIED per weapon per unit per minute would flood the feed */
const HIDDEN_EVENT_TYPES = new Set<GameEvent['type']>(['RESUPPLIED'])

const EVENT_FOCUS_ZOOM = 7

const AUTO_PAUSE_OPTIONS: { key: keyof AutoPauseSettings; label: string }[] = [
  { key: 'warDeclared', label: 'War declared' },
  { key: 'ownUnitDestroyed', label: 'Own unit destroyed' },
  { key: 'ceasefireOffered', label: 'Ceasefire offered' },
]

export default function AlertFeed() {
  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState(false)
  const [gearOpen, setGearOpen] = useState(false)
  // Last log entry the user had on screen — the unread badge derives from it
  const [lastSeen, setLastSeen] = useState<GameEvent | null>(() => {
    const initial = useGameStore.getState().eventLog
    return initial.length > 0 ? initial[initial.length - 1] : null
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const events = useGameStore((s) => s.viewState.events)
  const eventLog = useGameStore((s) => s.eventLog)
  const units = useGameStore((s) => s.viewState.units)
  const shippingLanes = useGameStore((s) => s.viewState.shippingLanes)
  const focusMap = useUIStore((s) => s.focusMap)
  const autoPause = useUIStore((s) => s.autoPause)
  const toggleAutoPause = useUIStore((s) => s.toggleAutoPause)

  // Render from the store-level event log so history survives unmount (mobile LOG tab)
  const log = useMemo(
    () => eventLog.filter((e) => !HIDDEN_EVENT_TYPES.has(e.type)).slice(-50),
    [eventLog],
  )

  const unitNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const u of units) names.set(u.id, u.name)
    return names
  }, [units])

  const unitPositions = useMemo(() => {
    const positions = new Map<string, Position>()
    for (const u of units) positions.set(u.id, u.position)
    return positions
  }, [units])

  const laneNames = useMemo(() => {
    const names = new Map<string, string>()
    for (const l of shippingLanes) names.set(l.id, l.name)
    return names
  }, [shippingLanes])

  const laneMidpoints = useMemo(() => {
    const mids = new Map<string, Position>()
    for (const l of shippingLanes) {
      const [lng, lat] = l.path[Math.floor(l.path.length / 2)]
      mids.set(l.id, { lng, lat })
    }
    return mids
  }, [shippingLanes])

  const unreadCount = useMemo(() => {
    if (lastSeen === null) return log.length
    const idx = log.lastIndexOf(lastSeen)
    return idx === -1 ? log.length : log.length - 1 - idx
  }, [log, lastSeen])

  const logRef = useRef(log)
  const expandedRef = useRef(expanded)
  useEffect(() => {
    logRef.current = log
    expandedRef.current = expanded
  }, [log, expanded])

  const markSeen = useCallback(() => {
    const current = logRef.current
    setLastSeen(current.length > 0 ? current[current.length - 1] : null)
  }, [])

  // Re-arm the auto-collapse timer per event batch. Batches are one-shot from the
  // worker — reference-guarded so StrictMode/unrelated re-renders don't re-arm
  const lastBatchRef = useRef<GameEvent[] | null>(null)
  useEffect(() => {
    if (events.length === 0 || lastBatchRef.current === events) return
    lastBatchRef.current = events
    if (events.every((e) => HIDDEN_EVENT_TYPES.has(e.type))) return

    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current)
    }
    collapseTimerRef.current = setTimeout(() => {
      if (expandedRef.current) {
        setExpanded(false)
        markSeen()
      }
    }, AUTO_COLLAPSE_MS)
  }, [events, markSeen])

  // Auto-pause on enabled triggers — same one-shot batch guard as above
  const pauseBatchRef = useRef<GameEvent[] | null>(null)
  useEffect(() => {
    if (events.length === 0 || pauseBatchRef.current === events) return
    pauseBatchRef.current = events

    const { viewState } = useGameStore.getState()
    if (viewState.time.speed <= 0) return
    const settings = useUIStore.getState().autoPause
    const shouldPause = events.some((e) =>
      (settings.warDeclared && e.type === 'WAR_DECLARED')
      || (settings.ceasefireOffered && e.type === 'CEASEFIRE_OFFERED')
      || (settings.ownUnitDestroyed && e.type === 'UNIT_DESTROYED'
        && viewState.units.find((u) => u.id === e.unitId)?.nation === viewState.playerNation),
    )
    if (shouldPause) sendCommand({ type: 'SET_SPEED', speed: 0 })
  }, [events])

  // Auto-scroll when expanded and new events arrive
  useEffect(() => {
    if (expanded) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }
  }, [log, expanded])

  const handleExpand = useCallback(() => {
    setExpanded(true)
    setGearOpen(false)
  }, [])

  const handleCollapse = useCallback(() => {
    setExpanded(false)
    setGearOpen(false)
    markSeen()
  }, [markSeen])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) {
        clearTimeout(collapseTimerRef.current)
      }
    }
  }, [])

  if (log.length === 0) return null

  const lastEvent = log[log.length - 1]

  // --- Collapsed view: single line ---
  if (!expanded) {
    return (
      <div
        onClick={handleExpand}
        style={isMobile ? {
          position: 'fixed',
          bottom: 44,
          left: 0,
          right: 0,
          width: '100%',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-default)',
          borderRadius: '12px 12px 0 0',
          padding: '6px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
          zIndex: 30,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        } : {
          position: 'absolute',
          bottom: 12,
          left: 12,
          width: 240,
          background: 'rgba(13, 17, 23, 0.8)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--panel-radius)',
          padding: '4px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.6rem',
          zIndex: 10,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          backdropFilter: 'blur(4px)',
        }}
      >
        {/* Unread badge */}
        {unreadCount > 0 && (
          <span style={{
            background: 'var(--status-damaged)',
            color: 'var(--text-primary)',
            borderRadius: 8,
            padding: '1px 5px',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 700,
            flexShrink: 0,
            lineHeight: '1.2',
          }}>
            {unreadCount}
          </span>
        )}

        {/* Label */}
        <span style={{
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          fontWeight: 600,
          flexShrink: 0,
        }}>
          EVENTS
        </span>

        {/* Last event summary */}
        <span style={{
          color: eventColor(lastEvent),
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {formatEvent(lastEvent, unitNames, laneNames)}
        </span>

        {/* Expand hint */}
        <span style={{
          color: 'var(--text-muted)',
          flexShrink: 0,
          fontSize: 'var(--font-size-xs)',
        }}>
          {'\u25BC'}
        </span>
      </div>
    )
  }

  // --- Expanded view: full scrolling log ---
  return (
    <div style={isMobile ? {
      position: 'fixed',
      bottom: 44,
      left: 0,
      right: 0,
      width: '100%',
      maxHeight: '50vh',
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-default)',
      borderRadius: '12px 12px 0 0',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-xs)',
      zIndex: 30,
      display: 'flex',
      flexDirection: 'column',
    } : {
      position: 'absolute',
      bottom: 12,
      left: 12,
      width: 300,
      maxHeight: 180,
      background: 'rgba(13, 17, 23, 0.85)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--panel-radius)',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.6rem',
      zIndex: 10,
      backdropFilter: 'blur(4px)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header with collapse button */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '6px 10px',
        borderBottom: '1px solid var(--border-default)',
        flexShrink: 0,
      }}>
        <span style={{
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}>
          Events ({log.length})
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setGearOpen(!gearOpen)}
              aria-label="Auto-pause settings"
              style={{
                background: 'none',
                border: 'none',
                color: gearOpen ? 'var(--text-accent)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
                padding: '0 2px',
              }}
            >
              {'\u2699'}
            </button>
            {gearOpen && (
              <div style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                right: 0,
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--panel-radius)',
                padding: 8,
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 150,
                whiteSpace: 'nowrap',
              }}>
                <span style={{
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  marginBottom: 2,
                }}>
                  Pause on
                </span>
                {AUTO_PAUSE_OPTIONS.map(({ key, label }) => (
                  <label
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={autoPause[key]}
                      onChange={() => toggleAutoPause(key)}
                      style={{ accentColor: 'var(--text-accent)', cursor: 'pointer' }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleCollapse}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              padding: '0 2px',
            }}
          >
            {'\u25B2'}
          </button>
        </div>
      </div>

      {/* Scrolling log */}
      <div
        ref={scrollRef}
        style={{
          overflowY: 'auto',
          padding: 8,
          flex: 1,
          ...(isMobile ? { WebkitOverflowScrolling: 'touch' as const } : {}),
        }}
      >
        {log.map((e, i) => {
          const pos = eventPosition(e, unitPositions, laneMidpoints)
          return (
            <div
              key={i}
              onClick={pos ? () => focusMap(pos.lng, pos.lat, EVENT_FOCUS_ZOOM) : undefined}
              title={pos ? 'Show on map' : undefined}
              style={{
                padding: '1px 0',
                color: eventColor(e),
                cursor: pos ? 'pointer' : 'default',
              }}
            >
              {formatEvent(e, unitNames, laneNames)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function eventColor(e: GameEvent): string {
  switch (e.type) {
    case 'MISSILE_LAUNCHED': return 'var(--status-engaged)'
    case 'MISSILE_INTERCEPTED': return 'var(--status-ready)'
    case 'MISSILE_IMPACT': return 'var(--status-damaged)'
    case 'UNIT_DESTROYED': return 'var(--status-damaged)'
    case 'WAR_DECLARED': return '#ff4444'
    case 'AMMO_DEPLETED': return 'var(--text-muted)'
    case 'POINT_DEFENSE_KILL': return 'var(--status-ready)'
    case 'UNIT_REPAIRED': return 'var(--status-moving)'
    case 'OIL_PRICE_CHANGE': return 'var(--status-engaged)'
    case 'SHIPPING_LANE_STATUS_CHANGE':
      return e.newStatus === 'blocked'
        ? 'var(--status-damaged)'
        : e.newStatus === 'reduced'
          ? 'var(--status-engaged)'
          : 'var(--status-ready)'
    case 'MINE_CONTACT': return 'var(--status-damaged)'
    case 'SUPPLY_LINE_INTERDICTED': return 'var(--status-engaged)'
    case 'SUPPLY_LINE_CUT': return 'var(--status-damaged)'
    case 'RESUPPLIED': return 'var(--status-ready)'
    case 'WAR_SUPPORT_CRITICAL': return 'var(--status-engaged)'
    case 'CEASEFIRE_OFFERED': return 'var(--status-ready)'
    case 'CEASEFIRE_REJECTED': return 'var(--text-muted)'
    case 'WAR_ENDED': return 'var(--status-ready)'
    case 'AUTO_ENGAGEMENT': return 'var(--status-engaged)'
    case 'MISSILE_MISSED': return 'var(--text-muted)'
    case 'ORDER_REJECTED': return 'var(--text-muted)'
    default: return 'var(--text-secondary)'
  }
}

function unitName(id: string, names: Map<string, string>): string {
  return names.get(id) ?? id
}

function weaponName(id: string): string {
  return weaponSpecs[id]?.name ?? id
}

function lineName(id: string): string {
  return id.toUpperCase().replace(/_/g, ' ')
}

function laneName(id: string, lanes: Map<string, string>): string {
  return (lanes.get(id) ?? lineName(id)).toUpperCase()
}

function eventPosition(
  e: GameEvent,
  unitPositions: Map<string, Position>,
  laneMidpoints: Map<string, Position>,
): Position | null {
  switch (e.type) {
    case 'MISSILE_INTERCEPTED':
      return e.position
    case 'MISSILE_IMPACT':
      return unitPositions.get(e.targetId) ?? null
    case 'MISSILE_LAUNCHED':
      return unitPositions.get(e.targetId) ?? unitPositions.get(e.launcherId) ?? null
    case 'MINE_CONTACT':
      return unitPositions.get(e.targetId) ?? unitPositions.get(e.minefieldId) ?? null
    case 'UNIT_DESTROYED':
    case 'AMMO_DEPLETED':
    case 'UNIT_REPAIRED':
    case 'POINT_DEFENSE_KILL':
    case 'RESUPPLIED':
    case 'ORDER_REJECTED':
      return unitPositions.get(e.unitId) ?? null
    case 'AUTO_ENGAGEMENT':
      return unitPositions.get(e.targetId) ?? unitPositions.get(e.unitId) ?? null
    case 'MISSILE_MISSED':
      return unitPositions.get(e.targetId) ?? null
    case 'SUPPLY_LINE_INTERDICTED':
      return unitPositions.get(e.threatUnitId) ?? null
    case 'SHIPPING_LANE_STATUS_CHANGE':
      return laneMidpoints.get(e.laneId) ?? null
    default:
      return null
  }
}

function formatEvent(e: GameEvent, names: Map<string, string>, lanes: Map<string, string>): string {
  switch (e.type) {
    case 'MISSILE_LAUNCHED':
      return `T+${e.tick} LAUNCH ${e.weaponName} -> ${unitName(e.targetId, names)}`
    case 'MISSILE_INTERCEPTED':
      return `T+${e.tick} INTERCEPT by ${unitName(e.interceptorId, names)}`
    case 'MISSILE_IMPACT':
      return `T+${e.tick} IMPACT on ${unitName(e.targetId, names)} (${e.damage} dmg)`
    case 'UNIT_DESTROYED':
      return `T+${e.tick} DESTROYED ${unitName(e.unitId, names)}`
    case 'WAR_DECLARED':
      return `T+${e.tick} WAR: ${e.attacker.toUpperCase()} -> ${e.defender.toUpperCase()}`
    case 'AMMO_DEPLETED':
      return `T+${e.tick} AMMO OUT: ${unitName(e.unitId, names)} / ${weaponName(e.weaponId)}`
    case 'RESUPPLIED':
      return `T+${e.tick} RESUPPLY ${unitName(e.unitId, names)} +${e.count} ${weaponName(e.weaponId)}`
    case 'SUPPLY_LINE_CUT':
      return `T+${e.tick} SUPPLY CUT: ${lineName(e.lineId)}`
    case 'POINT_DEFENSE_KILL':
      return `T+${e.tick} CIWS KILL by ${unitName(e.unitId, names)}`
    case 'UNIT_REPAIRED':
      return `T+${e.tick} REPAIRED ${unitName(e.unitId, names)} (+${e.healthRestored} HP)`
    case 'OIL_PRICE_CHANGE':
      return `T+${e.tick} OIL $${e.newPrice.toFixed(0)}/bbl (was $${e.oldPrice.toFixed(0)})`
    case 'SHIPPING_LANE_STATUS_CHANGE':
      return `T+${e.tick} ${laneName(e.laneId, lanes)}: ${e.newStatus.toUpperCase()}`
    case 'MINE_CONTACT':
      return `T+${e.tick} MINE HIT: ${unitName(e.targetId, names)} (-${e.damage} HP)`
    case 'SUPPLY_LINE_INTERDICTED':
      return `T+${e.tick} SUPPLY THREATENED: ${lineName(e.lineId)} (${e.healthAfter.toFixed(0)}% HP)`
    case 'WAR_SUPPORT_CRITICAL':
      return `T+${e.tick} WAR SUPPORT CRITICAL: ${e.nation.toUpperCase()} (${Math.round(e.support)}%)`
    case 'CEASEFIRE_OFFERED':
      return `T+${e.tick} CEASEFIRE OFFERED by ${e.by.toUpperCase()}`
    case 'CEASEFIRE_REJECTED':
      return `T+${e.tick} CEASEFIRE REJECTED by ${e.by.toUpperCase()}`
    case 'WAR_ENDED':
      return e.outcome === 'capitulation'
        ? `T+${e.tick} WAR ENDED: ${(e.loser ?? '').toUpperCase()} CAPITULATED`
        : `T+${e.tick} WAR ENDED: CEASEFIRE`
    case 'AUTO_ENGAGEMENT':
      return `T+${e.tick} ENGAGING ${unitName(e.targetId, names)}: ${e.weaponName} x${e.count}${e.quality === 'datalink' ? ' [LINK]' : ''}`
    case 'MISSILE_MISSED':
      return `T+${e.tick} MISS: ${unitName(e.targetId, names)} evaded (stale track)`
    case 'ORDER_REJECTED':
      return `T+${e.tick} ORDER REJECTED: ${unitName(e.unitId, names)} — ${e.reason}`
    default:
      return `T+${(e as GameEvent & { tick: number }).tick} ${(e as GameEvent & { type: string }).type}`
  }
}
