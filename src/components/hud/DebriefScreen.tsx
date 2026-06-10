import { useGameStore } from '@/store/game-store'
import { useMenuStore } from '@/store/menu-store'
import { useStrikeStore } from '@/store/strike-store'
import { useIntelStore } from '@/store/intel-store'
import { useUIStore } from '@/store/ui-store'
import ObjectivesPanel from './ObjectivesPanel'
import type { GameOverReport } from '@/types/game'

const OUTCOME_STYLES: Record<GameOverReport['outcome'], { label: string; color: string }> = {
  victory: { label: 'VICTORY', color: 'var(--status-ready)' },
  defeat: { label: 'DEFEAT', color: 'var(--status-damaged)' },
  ceasefire: { label: 'CEASEFIRE', color: 'var(--status-engaged)' },
}

export function formatDuration(ticks: number): string {
  const days = Math.floor(ticks / 86_400)
  const hours = Math.floor((ticks % 86_400) / 3_600)
  const minutes = Math.floor((ticks % 3_600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function DebriefScreen({ onDismiss }: { onDismiss: () => void }) {
  const gameOver = useGameStore((s) => s.viewState.gameOver)
  const warSupport = useGameStore((s) => s.viewState.warSupport)
  const nations = useGameStore((s) => s.viewState.nations)
  const playerNation = useGameStore((s) => s.viewState.playerNation)
  const objectives = useGameStore((s) => s.viewState.objectives)

  if (!gameOver) return null

  const enemyId = nations.find((n) => n.id !== playerNation)?.id
    ?? Object.keys(gameOver.stats.unitsLost).find((id) => id !== playerNation)
    ?? 'enemy'
  const nameOf = (id: string) => nations.find((n) => n.id === id)?.name.toUpperCase() ?? id.toUpperCase()

  const outcome = OUTCOME_STYLES[gameOver.outcome]
  const playerSupport = Math.round(warSupport[playerNation] ?? 0)
  const enemySupport = Math.round(warSupport[enemyId] ?? 0)
  const { stats } = gameOver

  const verdict = gameOver.outcome === 'ceasefire'
    ? playerSupport === enemySupport
      ? 'HONORS EVEN'
      : `${nameOf(playerSupport > enemySupport ? playerNation : enemyId)} HELD THE UPPER HAND`
    : gameOver.loser
      ? `${nameOf(gameOver.loser)} CAPITULATED`
      : null

  const handleMainMenu = () => {
    useStrikeStore.getState().reset()
    useIntelStore.getState().reset()
    const ui = useUIStore.getState()
    ui.clearSelection()
    ui.setLeftPanel(null)
    useUIStore.setState({ showIntel: false })
    useMenuStore.getState().setScreen('start')
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(13, 17, 23, 0.82)',
      backdropFilter: 'blur(3px)',
      fontFamily: 'var(--font-mono)',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-panel)',
        border: `1px solid ${outcome.color}`,
        borderRadius: 'var(--panel-radius)',
        boxShadow: `0 0 40px color-mix(in srgb, ${outcome.color} 18%, transparent)`,
        padding: 24,
        minWidth: 360,
        maxWidth: 560,
        width: '100%',
        maxHeight: '88vh',
        overflowY: 'auto',
      }}>
        <div style={{
          color: 'var(--text-muted)',
          fontSize: 'var(--font-size-xs)',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          After Action Report
        </div>

        <div style={{
          color: outcome.color,
          fontSize: '1.75rem',
          fontWeight: 700,
          letterSpacing: '0.18em',
          marginBottom: 4,
        }}>
          {outcome.label}
        </div>

        {verdict && (
          <div style={{
            color: 'var(--text-secondary)',
            fontSize: 'var(--font-size-sm)',
            letterSpacing: '0.08em',
            marginBottom: 16,
          }}>
            {verdict}
          </div>
        )}

        <SectionHeader>Final War Support</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          <SupportRow tag={nameOf(playerNation)} support={playerSupport} color="var(--text-accent)" />
          <SupportRow tag={nameOf(enemyId)} support={enemySupport} color="var(--status-damaged)" />
        </div>

        <SectionHeader>War Statistics</SectionHeader>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          columnGap: 20,
          rowGap: 4,
          marginBottom: 12,
          fontSize: 'var(--font-size-xs)',
        }}>
          <span />
          <ColHeader>{nameOf(playerNation)}</ColHeader>
          <ColHeader>{nameOf(enemyId)}</ColHeader>
          <StatLabel>Units lost</StatLabel>
          <StatValue>{stats.unitsLost[playerNation] ?? 0}</StatValue>
          <StatValue>{stats.unitsLost[enemyId] ?? 0}</StatValue>
          <StatLabel>Missiles fired</StatLabel>
          <StatValue>{stats.missilesFired[playerNation] ?? 0}</StatValue>
          <StatValue>{stats.missilesFired[enemyId] ?? 0}</StatValue>
          <StatLabel>Missiles intercepted</StatLabel>
          <StatValue>{stats.missilesIntercepted[playerNation] ?? 0}</StatValue>
          <StatValue>{stats.missilesIntercepted[enemyId] ?? 0}</StatValue>
        </div>
        <div style={{ marginBottom: 18, fontSize: 'var(--font-size-xs)' }}>
          <KVRow label="War duration" value={formatDuration(stats.durationTicks)} />
          <KVRow label="Peak oil price" value={`$${Math.round(stats.oilPeak)}/bbl`} />
          <KVRow label="Hormuz blocked" value={formatDuration(stats.hormuzBlockedTicks)} />
          <KVRow label="Hormuz reduced" value={formatDuration(stats.hormuzReducedTicks)} />
        </div>

        {objectives.length > 0 && (
          <>
            <SectionHeader>Objectives</SectionHeader>
            <div style={{ marginBottom: 18 }}>
              <ObjectivesPanel objectives={objectives} />
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            onClick={onDismiss}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: 3,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              padding: '8px 14px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap',
            }}
          >
            CONTINUE OBSERVING
          </button>
          <button
            onClick={handleMainMenu}
            style={{
              background: 'var(--border-accent)',
              border: '1px solid var(--border-accent)',
              borderRadius: 3,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--font-size-xs)',
              padding: '8px 14px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap',
            }}
          >
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: string }) {
  return (
    <div style={{
      color: 'var(--text-accent)',
      fontSize: 'var(--font-size-xs)',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      marginBottom: 8,
      paddingBottom: 4,
      borderBottom: '1px solid var(--border-default)',
    }}>
      {children}
    </div>
  )
}

function SupportRow({ tag, support, color }: { tag: string; support: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', width: 48, fontWeight: 600 }}>
        {tag}
      </span>
      <div style={{ flex: 1, height: 5, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, support))}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ color, fontSize: 'var(--font-size-xs)', fontWeight: 700, width: 34, textAlign: 'right' }}>
        {support}%
      </span>
    </div>
  )
}

function ColHeader({ children }: { children: string }) {
  return (
    <span style={{ color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', letterSpacing: '0.04em' }}>
      {children}
    </span>
  )
}

function StatLabel({ children }: { children: string }) {
  return <span style={{ color: 'var(--text-secondary)' }}>{children}</span>
}

function StatValue({ children }: { children: number }) {
  return <span style={{ color: 'var(--text-primary)', fontWeight: 700, textAlign: 'right' }}>{children}</span>
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}
