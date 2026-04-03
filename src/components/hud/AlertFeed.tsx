import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/game-store'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { GameEvent } from '@/types/game'

/** How long (ms) after the last new event before auto-collapsing */
const AUTO_COLLAPSE_MS = 10_000

export default function AlertFeed() {
  const isMobile = useIsMobile()
  const [log, setLog] = useState<GameEvent[]>([])
  const [expanded, setExpanded] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const events = useGameStore((s) => s.viewState.events)

  // Append new events to the log
  useEffect(() => {
    if (events.length === 0) return

    setLog((prev) => [...prev, ...events].slice(-50)) // keep last 50

    // If collapsed, increment unread count
    if (!expanded) {
      setUnreadCount((prev) => prev + events.length)
    }

    // Reset auto-collapse timer on new events
    if (collapseTimerRef.current) {
      clearTimeout(collapseTimerRef.current)
    }
    collapseTimerRef.current = setTimeout(() => {
      setExpanded(false)
    }, AUTO_COLLAPSE_MS)
  }, [events, expanded])

  // Auto-scroll when expanded and new events arrive
  useEffect(() => {
    if (expanded) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }
  }, [log, expanded])

  // Clear unread when expanding
  const handleExpand = useCallback(() => {
    setExpanded(true)
    setUnreadCount(0)
  }, [])

  const handleCollapse = useCallback(() => {
    setExpanded(false)
  }, [])

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
          {formatEvent(lastEvent)}
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
            {formatEvent(e)}
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
    default: return 'var(--text-secondary)'
  }
}

function formatEvent(e: GameEvent): string {
  switch (e.type) {
    case 'MISSILE_LAUNCHED':
      return `T+${e.tick} LAUNCH ${e.weaponName} -> ${e.targetId}`
    case 'MISSILE_INTERCEPTED':
      return `T+${e.tick} INTERCEPT ${e.missileId} by ${e.interceptorId}`
    case 'MISSILE_IMPACT':
      return `T+${e.tick} IMPACT on ${e.targetId} (${e.damage} dmg)`
    case 'UNIT_DESTROYED':
      return `T+${e.tick} DESTROYED ${e.unitId}`
    case 'WAR_DECLARED':
      return `T+${e.tick} WAR: ${e.attacker} -> ${e.defender}`
    case 'AMMO_DEPLETED':
      return `T+${e.tick} AMMO OUT: ${e.unitId} / ${e.weaponId}`
    case 'POINT_DEFENSE_KILL':
      return `T+${e.tick} CIWS KILL ${e.missileId} by ${e.unitId}`
    case 'UNIT_REPAIRED':
      return `T+${e.tick} REPAIRED ${e.unitId} (+${e.healthRestored} HP)`
    default:
      return `T+${(e as GameEvent & { tick: number }).tick} ${(e as GameEvent & { type: string }).type}`
  }
}
