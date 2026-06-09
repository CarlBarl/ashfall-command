import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '@/store/game-store'
import { useIsMobile } from '@/hooks/useIsMobile'
import { weaponSpecs } from '@/data/weapons/missiles'
import type { GameEvent } from '@/types/game'

/** How long (ms) after the last new event before auto-collapsing */
const AUTO_COLLAPSE_MS = 10_000

/** Logistics churn — one RESUPPLIED per weapon per unit per minute would flood the feed */
const HIDDEN_EVENT_TYPES = new Set<GameEvent['type']>(['RESUPPLIED'])

export default function AlertFeed() {
  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState(false)
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

  // Auto-scroll when expanded and new events arrive
  useEffect(() => {
    if (expanded) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }
  }, [log, expanded])

  const handleExpand = useCallback(() => {
    setExpanded(true)
  }, [])

  const handleCollapse = useCallback(() => {
    setExpanded(false)
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
          {formatEvent(lastEvent, unitNames)}
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
        {log.map((e, i) => (
          <div key={i} style={{ padding: '1px 0', color: eventColor(e) }}>
            {formatEvent(e, unitNames)}
          </div>
        ))}
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

function formatEvent(e: GameEvent, names: Map<string, string>): string {
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
      return `T+${e.tick} ${lineName(e.laneId)}: ${e.newStatus.toUpperCase()}`
    case 'MINE_CONTACT':
      return `T+${e.tick} MINE HIT: ${unitName(e.targetId, names)} (-${e.damage} HP)`
    case 'SUPPLY_LINE_INTERDICTED':
      return `T+${e.tick} SUPPLY THREATENED: ${lineName(e.lineId)} (${e.healthAfter.toFixed(0)}% HP)`
    default:
      return `T+${(e as GameEvent & { tick: number }).tick} ${(e as GameEvent & { type: string }).type}`
  }
}
