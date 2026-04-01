import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import { useIsMobile } from '@/hooks/useIsMobile'

const SPEEDS = [0, 1, 10, 60, 600, 3600]
const SPEED_LABELS: Record<number, string> = {
  0: '||',
  1: '1x',
  10: '10x',
  60: '1m/s',
  600: '10m',
  3600: '1hr',
}

const MOBILE_SPEEDS = [0, 1, 60, 600, 3600]
const MOBILE_LABELS: Record<number, string> = {
  0: '||',
  1: '1x',
  60: '1m',
  600: '10m',
  3600: '1h',
}

export default function TimeControls() {
  const isMobile = useIsMobile()
  const time = useGameStore((s) => s.viewState.time)

  const gameDate = new Date(time.timestamp)
  const dateStr = gameDate.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
    timeZone: 'UTC',
  })
  const timeStr = gameDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
    ...(isMobile ? {} : { second: '2-digit' }),
    hour12: false,
    timeZone: 'UTC',
  })

  const speeds = isMobile ? MOBILE_SPEEDS : SPEEDS
  const labels = isMobile ? MOBILE_LABELS : SPEED_LABELS

  return (
    <div
      className={isMobile ? 'mobile-time' : ''}
      style={{
        position: 'absolute',
        top: isMobile ? 4 : 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: isMobile ? 3 : 6,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: isMobile ? '3px 6px' : '6px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: isMobile ? 'var(--font-size-xs)' : 'var(--font-size-sm)',
        zIndex: 10,
      }}
    >
      <span
        className="time-date"
        style={{
          color: 'var(--text-accent)',
          fontWeight: 600,
          minWidth: isMobile ? 90 : 170,
          textAlign: 'center',
          fontSize: isMobile ? '0.6rem' : undefined,
        }}
      >
        {dateStr} {timeStr}Z
      </span>

      <div style={{ width: 1, height: isMobile ? 14 : 20, background: 'var(--border-default)' }} />

      {speeds.map((s) => (
        <button
          key={s}
          onClick={() => sendCommand({ type: 'SET_SPEED', speed: s })}
          style={{
            background: time.speed === s ? 'var(--border-accent)' : 'var(--bg-hover)',
            color: time.speed === s ? 'var(--text-primary)' : 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            padding: isMobile ? '3px 4px' : '3px 6px',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: isMobile ? '0.55rem' : 'var(--font-size-xs)',
            fontWeight: 600,
            minWidth: isMobile ? 24 : 36,
          }}
        >
          {labels[s]}
        </button>
      ))}
    </div>
  )
}
