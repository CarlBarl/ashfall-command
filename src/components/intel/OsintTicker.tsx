import { useEffect, useState } from 'react'
import { useOsintFeed } from '@/intel/osint-feed'
import { useUIStore } from '@/store/ui-store'

const CYCLE_MS = 6_000

/** One-line OSINT crawl just above the AlertFeed; click opens the INTEL panel */
export default function OsintTicker() {
  const posts = useOsintFeed()
  const toggleIntel = useUIStore((s) => s.toggleIntel)
  const [cursor, setCursor] = useState(0)

  const latest = posts.slice(0, 3)

  useEffect(() => {
    if (latest.length < 2) return
    const iv = setInterval(() => setCursor((c) => c + 1), CYCLE_MS)
    return () => clearInterval(iv)
  }, [latest.length])

  if (latest.length === 0) return null
  const post = latest[cursor % latest.length]

  return (
    <div
      onClick={toggleIntel}
      title="Open INTEL panel"
      style={{
        position: 'absolute',
        bottom: 40,
        left: 12,
        width: 240,
        background: 'rgba(13, 17, 23, 0.7)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--panel-radius)',
        padding: '3px 8px',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.55rem',
        // Below the AlertFeed so its expanded log covers the ticker, not vice versa
        zIndex: 9,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        backdropFilter: 'blur(4px)',
        opacity: 0.85,
      }}
    >
      <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, flexShrink: 0, letterSpacing: '0.08em' }}>
        OSINT
      </span>
      <span style={{ color: post.color, fontWeight: 600, flexShrink: 0 }}>
        {post.handle}
      </span>
      <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {post.text}
      </span>
    </div>
  )
}
