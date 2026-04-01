import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/game-store'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { GameEvent } from '@/types/game'

export default function AlertFeed() {
  const isMobile = useIsMobile()
  const [log, setLog] = useState<GameEvent[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const events = useGameStore((s) => s.viewState.events)

  useEffect(() => {
    if (events.length > 0) {
      setLog((prev) => [...prev, ...events].slice(-50)) // keep last 50
    }
  }, [events])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [log])

  if (log.length === 0) return null

  return (
    <div
      ref={scrollRef}
      style={isMobile ? {
        position: 'fixed',
        bottom: 44,
        left: 0,
        right: 0,
        width: '100%',
        maxHeight: '50vh',
        overflowY: 'auto',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: '12px 12px 0 0',
        padding: 8,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        zIndex: 30,
        WebkitOverflowScrolling: 'touch',
      } : {
        position: 'absolute',
        bottom: 12,
        left: 12,
        width: 320,
        maxHeight: 200,
        overflowY: 'auto',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: 8,
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        zIndex: 10,
      }}
    >
      <div style={{
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        fontSize: 'var(--font-size-xs)',
        marginBottom: 4,
        fontWeight: 600,
      }}>
        Events
      </div>
      {log.map((e, i) => (
        <div key={i} style={{ padding: '1px 0', color: eventColor(e) }}>
          {formatEvent(e)}
        </div>
      ))}
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
    default: return 'var(--text-secondary)'
  }
}

function formatEvent(e: GameEvent): string {
  switch (e.type) {
    case 'MISSILE_LAUNCHED':
      return `T+${e.tick} LAUNCH ${e.weaponName} → ${e.targetId}`
    case 'MISSILE_INTERCEPTED':
      return `T+${e.tick} INTERCEPT ${e.missileId} by ${e.interceptorId}`
    case 'MISSILE_IMPACT':
      return `T+${e.tick} IMPACT on ${e.targetId} (${e.damage} dmg)`
    case 'UNIT_DESTROYED':
      return `T+${e.tick} DESTROYED ${e.unitId}`
    case 'WAR_DECLARED':
      return `T+${e.tick} WAR: ${e.attacker} → ${e.defender}`
    case 'AMMO_DEPLETED':
      return `T+${e.tick} AMMO OUT: ${e.unitId} / ${e.weaponId}`
    default:
      return `T+${(e as GameEvent & { tick: number }).tick} ${(e as GameEvent & { type: string }).type}`
  }
}
