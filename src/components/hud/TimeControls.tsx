import { useState, useCallback } from 'react'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import { useIsMobile } from '@/hooks/useIsMobile'

// Preset speed buttons: label → ticks per 100ms
const PRESETS = [
  { label: '||', speed: 0 },
  { label: '1s', speed: 0.1 },
  { label: '1m', speed: 6 },
  { label: '1h', speed: 600 },
]

// Slider maps a 0-100 range to exponential speed scale
// 0 = paused, 1-100 = 0.1 (1s/s) to 3600 (10h/s)
function sliderToSpeed(val: number): number {
  if (val === 0) return 0
  // Exponential: 0.1 at val=1, 3600 at val=100
  return 0.1 * Math.pow(36000, (val - 1) / 99)
}

function speedToSlider(speed: number): number {
  if (speed <= 0) return 0
  // Inverse of above
  return Math.round(1 + 99 * Math.log(speed / 0.1) / Math.log(36000))
}

function speedLabel(speed: number): string {
  if (speed <= 0) return 'PAUSED'
  if (speed < 0.15) return '1s/s'
  if (speed < 0.5) return `${Math.round(speed * 10)}s/s`
  if (speed < 5) return `${Math.round(speed * 10)}s/s`
  if (speed < 30) return `${Math.round(speed / 6 * 10) / 10}m/s`
  if (speed < 300) return `${Math.round(speed / 6)}m/s`
  if (speed < 1800) return `${Math.round(speed / 60 * 10) / 10}h/s`
  return `${Math.round(speed / 360) / 10}h/s`
}

export default function TimeControls() {
  const isMobile = useIsMobile()
  const time = useGameStore((s) => s.viewState.time)
  const [showSlider, setShowSlider] = useState(false)

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

  const setSpeed = useCallback((speed: number) => {
    sendCommand({ type: 'SET_SPEED', speed })
  }, [])

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setSpeed(sliderToSpeed(val))
  }, [setSpeed])

  const sliderVal = speedToSlider(time.speed)

  return (
    <div
      className={isMobile ? 'mobile-time' : ''}
      style={{
        position: 'absolute',
        top: isMobile ? 4 : 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: isMobile ? '3px 6px' : '6px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: isMobile ? 'var(--font-size-xs)' : 'var(--font-size-sm)',
        zIndex: 10,
      }}
    >
      {/* Top row: date + preset buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 3 : 6 }}>
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

        {PRESETS.map((p) => (
          <button
            key={p.speed}
            onClick={() => setSpeed(p.speed)}
            style={{
              background: time.speed === p.speed ? 'var(--border-accent)' : 'var(--bg-hover)',
              color: time.speed === p.speed ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              padding: isMobile ? '3px 4px' : '3px 6px',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: isMobile ? '0.55rem' : 'var(--font-size-xs)',
              fontWeight: 600,
              minWidth: isMobile ? 24 : 32,
            }}
          >
            {p.label}
          </button>
        ))}

        {/* Slider toggle */}
        <button
          onClick={() => setShowSlider(!showSlider)}
          style={{
            background: showSlider ? 'var(--border-accent)' : 'var(--bg-hover)',
            color: showSlider ? 'var(--text-primary)' : 'var(--text-muted)',
            border: '1px solid var(--border-default)',
            borderRadius: 4,
            padding: isMobile ? '3px 4px' : '3px 6px',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: isMobile ? '0.55rem' : 'var(--font-size-xs)',
            fontWeight: 600,
          }}
          title="Fine speed control"
        >
          &gt;
        </button>
      </div>

      {/* Slider row */}
      {showSlider && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 4,
            width: '100%',
          }}
        >
          <input
            type="range"
            min={0}
            max={100}
            value={sliderVal}
            onChange={handleSlider}
            style={{
              flex: 1,
              height: 4,
              cursor: 'pointer',
              accentColor: 'var(--text-accent)',
            }}
          />
          <span
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
              minWidth: 50,
              textAlign: 'right',
              fontWeight: 600,
            }}
          >
            {speedLabel(time.speed)}
          </span>
        </div>
      )}
    </div>
  )
}
