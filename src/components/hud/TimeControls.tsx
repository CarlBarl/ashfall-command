import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import type { GameTime } from '@/types/game'

const SPEEDS: GameTime['speed'][] = [0, 1, 2, 5, 10]
const SPEED_LABELS: Record<number, string> = {
  0: '⏸',
  1: '1x',
  2: '2x',
  5: '5x',
  10: '10x',
}

export default function TimeControls() {
  const time = useGameStore((s) => s.viewState.time)

  const gameDate = new Date(time.timestamp)
  const dateStr = gameDate.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    timeZone: 'UTC',
  })
  const timeStr = gameDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  })

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-default)',
      borderRadius: 'var(--panel-radius)',
      padding: '6px 12px',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--font-size-sm)',
      zIndex: 10,
    }}>
      <span style={{ color: 'var(--text-accent)', fontWeight: 600, minWidth: 140, textAlign: 'center' }}>
        {dateStr} {timeStr}Z
      </span>

      <div style={{ width: 1, height: 20, background: 'var(--border-default)' }} />

      {SPEEDS.map((s) => (
        <button
          key={s}
          onClick={() => sendCommand({ type: 'SET_SPEED', speed: s })}
          style={{
            background: time.speed === s ? 'var(--border-accent)' : 'var(--bg-hover)',
            color: time.speed === s ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            padding: '3px 8px',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            minWidth: 32,
          }}
        >
          {SPEED_LABELS[s]}
        </button>
      ))}

      <div style={{ width: 1, height: 20, background: 'var(--border-default)' }} />

      <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>
        T+{time.tick}
      </span>
    </div>
  )
}
