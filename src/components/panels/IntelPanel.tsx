import { useState, type CSSProperties } from 'react'
import Panel from '@/components/common/Panel'
import IntelBudgetPanel from '@/components/panels/IntelBudgetPanel'
import { useIntelStore, type IntelTab } from '@/store/intel-store'
import { useUIStore } from '@/store/ui-store'
import { useGameStore } from '@/store/game-store'
import { sendCommand } from '@/store/bridge'
import { cloudCoverUrl } from '@/data/feeds'
import { useOsintFeed } from '@/intel/osint-feed'
import type {
  AgentSource,
  IntelAsset,
  IntelAssetKind,
  IntelProduct,
  InterceptPrecedence,
  Position,
} from '@/types/game'
import type { IntelViewState, ViewUnit } from '@/types/view'

const HOUR = 3600
const AGENT_TASK_COOLDOWN_TICKS = HOUR

const TABS: { id: IntelTab; label: string }[] = [
  { id: 'isr', label: 'ISR' },
  { id: 'sigint', label: 'SIGINT' },
  { id: 'humint', label: 'HUMINT' },
  { id: 'osint', label: 'OSINT' },
  { id: 'opsec', label: 'OPSEC' },
]

const KIND_LABELS: Record<IntelAssetKind, string> = {
  optical_sat: 'OPTICAL RECON SAT',
  commercial_sat: 'COMMERCIAL EO LAYER',
  sigint_air: 'SIGINT AIRCRAFT',
  maritime_patrol: 'MARITIME PATROL UAS',
  launch_detection: 'OPIR LAUNCH DETECTION',
  recon_drone: 'RECON DRONE',
  fast_boats: 'PICKET BOATS',
}

const TASKABLE_KINDS: IntelAssetKind[] = ['optical_sat', 'commercial_sat']

const PRECEDENCE_COLORS: Record<InterceptPrecedence, string> = {
  FLASH: '#ff4444',
  IMMEDIATE: 'var(--status-engaged)',
  PRIORITY: 'var(--text-primary)',
  ROUTINE: 'var(--text-muted)',
}

const PARANOIA_COLORS: Record<IntelViewState['paranoiaBand'], string> = {
  LOW: 'var(--text-muted)',
  ELEVATED: 'var(--text-primary)',
  HIGH: 'var(--status-engaged)',
  SEVERE: 'var(--status-damaged)',
}

const AGENT_STATUS_COLORS: Record<AgentSource['status'], string> = {
  active: 'var(--status-ready)',
  resting: 'var(--text-accent)',
  exfiltrating: 'var(--status-engaged)',
  exfiltrated: 'var(--text-muted)',
  arrested: 'var(--status-damaged)',
}

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

const BTN_DISABLED: CSSProperties = { ...BTN, opacity: 0.4, cursor: 'default' }

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

function tPlus(tick: number): string {
  const h = Math.floor(tick / 3600)
  const m = Math.floor((tick % 3600) / 60)
  return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function fmtPos(p: Position): string {
  return `${p.lat.toFixed(2)}N ${p.lng.toFixed(2)}E`
}

function nextPassLabel(asset: IntelAsset, tick: number): string {
  if (asset.status !== 'active') return 'OFFLINE'
  if (asset.revisit_min === 0) return 'CONTINUOUS'
  const remaining = asset.lastCollectionTick + asset.revisit_min * 60 - tick
  return remaining <= 0 ? 'READY' : fmtTicks(remaining)
}

/** Real cloud cover for the AOI — 3s budget, any failure means "omit and let the engine roll" */
async function fetchCloudPct(target: Position): Promise<number | undefined> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 3000)
    try {
      const res = await fetch(cloudCoverUrl(target.lat, target.lng), { signal: ctrl.signal })
      if (!res.ok) return undefined
      const data = await res.json()
      const cc = data?.current?.cloud_cover
      return typeof cc === 'number' && Number.isFinite(cc) ? cc : undefined
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return undefined
  }
}

export default function IntelPanel({ onClose }: { onClose?: () => void }) {
  const toggleIntel = useUIStore((s) => s.toggleIntel)
  const activeTab = useIntelStore((s) => s.activeTab)
  const setActiveTab = useIntelStore((s) => s.setActiveTab)
  const intel = useGameStore((s) => s.viewState.intel)
  const tick = useGameStore((s) => s.viewState.time.tick)
  const units = useGameStore((s) => s.viewState.units)
  const playerNation = useGameStore((s) => s.viewState.playerNation)

  return (
    <Panel
      title="INTELLIGENCE"
      onClose={onClose ?? toggleIntel}
      style={{
        position: 'absolute',
        top: 44,
        right: 12,
        maxHeight: '70vh',
        width: 340,
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1,
              background: activeTab === t.id ? 'var(--bg-hover)' : 'none',
              border: '1px solid',
              borderColor: activeTab === t.id ? 'var(--border-accent)' : 'var(--border-default)',
              borderRadius: 3,
              color: activeTab === t.id ? 'var(--text-accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.55rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              padding: '4px 0',
              textTransform: 'uppercase',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!intel ? (
        <div style={HINT}>INTEL FEED OFFLINE</div>
      ) : (
        <>
          {activeTab === 'isr' && (
            <IsrTab intel={intel} tick={tick} units={units} playerNation={playerNation} />
          )}
          {activeTab === 'sigint' && (
            <SigintTab
              products={intel.products}
              tick={tick}
              blackoutUntil={intel.encryptionUpgradedUntilTick}
            />
          )}
          {activeTab === 'humint' && <HumintTab agents={intel.agents} tick={tick} />}
          {activeTab === 'osint' && <OsintTab />}
          {activeTab === 'opsec' && (
            <OpsecTab intel={intel} units={units} playerNation={playerNation} />
          )}
        </>
      )}
    </Panel>
  )
}

// ── ISR ─────────────────────────────────────────────────────────────────────

interface AoiOption {
  key: string
  label: string
  sub: string
  position: Position
}

function IsrTab({
  intel,
  tick,
  units,
  playerNation,
}: {
  intel: IntelViewState
  tick: number
  units: ViewUnit[]
  playerNation: string
}) {
  const estimates = useIntelStore((s) => s.estimatedUnits)
  const [pickerAssetId, setPickerAssetId] = useState<string | null>(null)
  const [wxCheckAssetId, setWxCheckAssetId] = useState<string | null>(null)

  const aoiOptions: AoiOption[] = [
    ...units
      .filter((u) => u.nation !== playerNation && u.status !== 'destroyed')
      .map((u) => ({
        key: u.id,
        label: u.name,
        sub: `${fmtPos(u.position)} · ${u.visibility.toUpperCase()}`,
        position: u.position,
      })),
    ...estimates.map((e) => ({
      key: e.id,
      label: e.name,
      sub: `${fmtPos(e.position)} · ESTIMATE`,
      position: e.position,
    })),
  ]

  const taskPass = async (assetId: string, target: Position) => {
    setPickerAssetId(null)
    setWxCheckAssetId(assetId)
    const cloudPct = await fetchCloudPct(target)
    setWxCheckAssetId(null)
    if (cloudPct === undefined) {
      sendCommand({ type: 'TASK_SATELLITE_PASS', assetId, target })
    } else {
      sendCommand({ type: 'TASK_SATELLITE_PASS', assetId, target, cloudPct })
    }
  }

  return (
    <div>
      <div style={SECTION_HEADER}>Collection Assets</div>
      {intel.assets.map((asset) => {
        const taskable = TASKABLE_KINDS.includes(asset.kind) && asset.status === 'active'
        const pickerOpen = pickerAssetId === asset.id
        const wxBusy = wxCheckAssetId === asset.id
        return (
          <div key={asset.id} style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--text-primary)' }}>
                {asset.name}
              </span>
              <span style={{
                fontSize: '0.5rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                color: asset.status === 'active' ? 'var(--status-ready)' : 'var(--status-damaged)',
              }}>
                {asset.status.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ ...MUTED_XS, flex: 1 }}>{KIND_LABELS[asset.kind]}</span>
              <span style={{ ...MUTED_XS, color: 'var(--text-secondary)' }}>
                NEXT PASS {nextPassLabel(asset, tick)}
              </span>
            </div>
            {taskable && (
              <div style={{ marginTop: 4 }}>
                <button
                  onClick={() => setPickerAssetId(pickerOpen ? null : asset.id)}
                  disabled={wxBusy}
                  style={pickerOpen ? { ...BTN, borderColor: 'var(--border-accent)', color: 'var(--text-accent)' } : wxBusy ? BTN_DISABLED : BTN}
                >
                  {wxBusy ? 'WX CHECK…' : pickerOpen ? 'CANCEL' : 'TASK PASS'}
                </button>
              </div>
            )}
            {pickerOpen && (
              <div style={{ marginTop: 4, borderTop: '1px solid var(--border-default)', paddingTop: 4 }}>
                <div style={{ ...MUTED_XS, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                  Select AOI
                </div>
                {aoiOptions.length === 0 && (
                  <div style={HINT}>No enemy contacts or estimates to target.</div>
                )}
                {aoiOptions.map((opt) => (
                  <div
                    key={opt.key}
                    onClick={() => { void taskPass(asset.id, opt.position) }}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 6,
                      padding: '2px 4px',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{
                      flex: 1,
                      color: 'var(--text-primary)',
                      fontSize: 'var(--font-size-xs)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {opt.label}
                    </span>
                    <span style={{ ...MUTED_XS, flexShrink: 0 }}>{opt.sub}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {intel.taskings.length > 0 && (
        <>
          <div style={SECTION_HEADER}>Queued Taskings</div>
          {intel.taskings.map((t) => {
            const asset = intel.assets.find((a) => a.id === t.assetId)
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '2px 4px' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 'var(--font-size-xs)', flex: 1 }}>
                  {asset?.name ?? t.assetId}
                </span>
                <span style={MUTED_XS}>{fmtPos(t.target)}</span>
                <span style={{ ...MUTED_XS, color: 'var(--status-engaged)' }}>
                  {asset ? (nextPassLabel(asset, tick) === 'READY' ? 'RESOLVING…' : nextPassLabel(asset, tick)) : '—'}
                </span>
              </div>
            )
          })}
        </>
      )}

      <div style={{ marginTop: 8 }}>
        <IntelBudgetPanel />
      </div>
    </div>
  )
}

// ── SIGINT ──────────────────────────────────────────────────────────────────

function SigintTab({
  products,
  tick,
  blackoutUntil,
}: {
  products: IntelProduct[]
  tick: number
  blackoutUntil: number | null
}) {
  const intercepts = products.filter((p) => p.kind === 'sigint')
  const dark = blackoutUntil !== null && blackoutUntil > tick

  return (
    <div>
      {dark && (
        <div style={{
          border: '1px solid var(--status-damaged)',
          borderRadius: 4,
          padding: '6px 8px',
          marginBottom: 8,
          color: 'var(--status-damaged)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 700,
          letterSpacing: '0.04em',
        }}>
          ENCRYPTION UPGRADED — COLLECTION DARK
          <div style={{ ...MUTED_XS, color: 'var(--text-secondary)', fontWeight: 400, marginTop: 2 }}>
            Adversary rotated crypto. Intercepts resume in {fmtTicks((blackoutUntil ?? 0) - tick)}.
          </div>
        </div>
      )}

      <div style={SECTION_HEADER}>Intercepts</div>
      {intercepts.length === 0 && <div style={HINT}>No intercepts collected.</div>}
      {intercepts.map((p) => (
        <div key={p.id} style={CARD}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              border: `1px solid ${PRECEDENCE_COLORS[p.precedence ?? 'ROUTINE']}`,
              borderRadius: 2,
              color: PRECEDENCE_COLORS[p.precedence ?? 'ROUTINE'],
              fontSize: '0.5rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              padding: '0 4px',
            }}>
              {p.precedence ?? 'ROUTINE'}
            </span>
            <span style={{ ...MUTED_XS, flex: 1 }}>{p.classification}</span>
            <span style={MUTED_XS}>{tPlus(p.tick)}</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: 3, lineHeight: 1.4 }}>
            {p.caption}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── HUMINT ──────────────────────────────────────────────────────────────────

function HumintTab({ agents, tick }: { agents: AgentSource[]; tick: number }) {
  const live = agents.filter(
    (a) => a.status === 'active' || a.status === 'resting' || a.status === 'exfiltrating',
  )
  const gone = agents.filter((a) => a.status === 'arrested' || a.status === 'exfiltrated')

  return (
    <div>
      <div style={SECTION_HEADER}>Source Network</div>
      <div style={HINT}>Tasking raises exposure ~15-25%</div>
      {agents.length === 0 && <div style={HINT}>No sources in country.</div>}
      {live.map((a) => <AgentCard key={a.id} agent={a} tick={tick} />)}
      {gone.map((a) => (
        <div
          key={a.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px',
            marginBottom: 4,
            borderLeft: `2px solid ${a.status === 'arrested' ? 'var(--status-damaged)' : 'var(--border-default)'}`,
            opacity: 0.55,
          }}
        >
          <span style={{ flex: 1, fontWeight: 700, fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            {a.codename}
          </span>
          <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.05em', color: AGENT_STATUS_COLORS[a.status] }}>
            {a.status.toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  )
}

function AgentCard({ agent, tick }: { agent: AgentSource; tick: number }) {
  const cooldownLeft = AGENT_TASK_COOLDOWN_TICKS - (tick - agent.lastTaskedTick)
  const onCooldown = cooldownLeft > 0
  const exposure = Math.round(agent.exposure)

  return (
    <div style={CARD}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
          {agent.codename}
        </span>
        <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.05em', color: AGENT_STATUS_COLORS[agent.status] }}>
          {agent.status.toUpperCase()}
        </span>
      </div>
      <div style={{ ...MUTED_XS, color: 'var(--text-secondary)' }}>{agent.placement}</div>
      <div style={MUTED_XS}>{agent.product}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <span style={{ ...MUTED_XS, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
          Exposure
        </span>
        <div style={{ flex: 1, height: 5, background: 'var(--bar-bg)', border: '1px solid var(--bar-border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${exposure}%`,
            height: '100%',
            backgroundImage: 'linear-gradient(90deg, var(--status-ready), var(--status-engaged), var(--status-damaged))',
            backgroundSize: exposure > 0 ? `${10000 / exposure}% 100%` : '100% 100%',
          }} />
        </div>
        <span style={{ ...MUTED_XS, color: 'var(--text-secondary)', flexShrink: 0 }}>{exposure}%</span>
      </div>

      {agent.status === 'exfiltrating' ? (
        <div style={{ ...MUTED_XS, color: 'var(--status-engaged)', marginTop: 4, fontWeight: 600 }}>
          EXFIL IN PROGRESS — {fmtTicks((agent.exfilCompleteTick ?? tick) - tick)}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
            <button
              onClick={() => sendCommand({ type: 'TASK_AGENT', agentId: agent.id })}
              disabled={onCooldown}
              style={onCooldown ? BTN_DISABLED : BTN}
            >
              TASK
            </button>
            <button
              onClick={() => sendCommand({ type: 'REST_AGENT', agentId: agent.id })}
              disabled={agent.status === 'resting'}
              style={agent.status === 'resting' ? BTN_DISABLED : BTN}
            >
              REST
            </button>
            <button
              onClick={() => sendCommand({ type: 'EXFILTRATE_AGENT', agentId: agent.id })}
              style={BTN}
            >
              EXFILTRATE
            </button>
          </div>
          <div style={HINT}>
            {onCooldown ? `Comms window in ${fmtTicks(cooldownLeft)} · ` : ''}Exfiltrate: 6h to extract
          </div>
        </>
      )}
    </div>
  )
}

// ── OSINT ───────────────────────────────────────────────────────────────────

function OsintTab() {
  const posts = useOsintFeed()
  const [filter, setFilter] = useState<string | null>(null)

  const handles = Array.from(new Set(posts.map((p) => p.handle)))
  const sorted = [...posts].sort((a, b) => b.tick - a.tick)
  const shown = filter ? sorted.filter((p) => p.handle === filter) : sorted

  return (
    <div>
      <div style={SECTION_HEADER}>Open Sources</div>
      {handles.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
          <button
            onClick={() => setFilter(null)}
            style={filter === null ? { ...BTN, borderColor: 'var(--border-accent)', color: 'var(--text-accent)' } : BTN}
          >
            ALL
          </button>
          {handles.map((h) => (
            <button
              key={h}
              onClick={() => setFilter(filter === h ? null : h)}
              style={filter === h ? { ...BTN, borderColor: 'var(--border-accent)', color: 'var(--text-accent)' } : BTN}
            >
              {h.replace('@', '')}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 && <div style={HINT}>Monitoring open sources&hellip;</div>}
      {shown.map((p) => (
        <div key={p.id} style={{ padding: '4px 2px', borderBottom: '1px solid var(--bar-border)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ color: p.color, fontSize: 'var(--font-size-xs)', fontWeight: 700, flex: 1 }}>
              {p.handle}
            </span>
            <span style={MUTED_XS}>{tPlus(p.tick)}</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-xs)', lineHeight: 1.4, marginTop: 1 }}>
            {p.text}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── OPSEC ───────────────────────────────────────────────────────────────────

function OpsecTab({
  intel,
  units,
  playerNation,
}: {
  intel: IntelViewState
  units: ViewUnit[]
  playerNation: string
}) {
  const leak = Math.round(intel.leakLevel)
  const leakColor = leak > 60
    ? 'var(--status-damaged)'
    : leak >= 40
      ? 'var(--status-engaged)'
      : 'var(--status-ready)'

  const radarUnits = units.filter(
    (u) => u.nation === playerNation && u.sensors.some((s) => s.type === 'radar'),
  )

  return (
    <div>
      <div style={SECTION_HEADER}>Operations Security</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ ...MUTED_XS, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
          Leak level
        </span>
        <div style={{ flex: 1, height: 6, background: 'var(--bar-bg)', border: '1px solid var(--bar-border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${leak}%`, height: '100%', background: leakColor }} />
        </div>
        <span style={{ color: leakColor, fontSize: 'var(--font-size-xs)', fontWeight: 700, flexShrink: 0 }}>
          {leak}%
        </span>
      </div>
      <div style={MUTED_XS}>+ carrier operating inside the strait</div>
      <div style={MUTED_XS}>+ each strike launched (pattern analysis)</div>
      <div style={MUTED_XS}>+ agents lost to counterintelligence</div>

      <div style={{ marginTop: 8 }}>
        <button
          onClick={() => sendCommand({ type: 'OPSEC_SWEEP' })}
          style={{ ...BTN, width: '100%', padding: '5px 8px', fontSize: '0.6rem' }}
        >
          OPSEC SWEEP
        </button>
        <div style={HINT}>Purge comms patterns, rotate callsigns. Once per 6h.</div>
      </div>

      <div style={{ ...SECTION_HEADER, marginTop: 8 }}>Counterintel Threat</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
        <span style={{ ...MUTED_XS, textTransform: 'uppercase', letterSpacing: '0.04em', flex: 1 }}>
          Iranian counterintel posture
        </span>
        <span style={{ color: PARANOIA_COLORS[intel.paranoiaBand], fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.05em' }}>
          {intel.paranoiaBand}
        </span>
      </div>

      <div style={{ ...SECTION_HEADER, marginTop: 8 }}>EMCON — Radar Emitters</div>
      {radarUnits.length === 0 && <div style={HINT}>No radar-equipped units.</div>}
      {radarUnits.map((u) => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <span style={{
            flex: 1,
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-xs)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {u.name}
          </span>
          <button
            onClick={() => sendCommand({ type: 'SET_EMCON', unitId: u.id, emcon: !u.emcon })}
            style={{
              ...BTN,
              color: u.emcon ? 'var(--status-engaged)' : 'var(--status-ready)',
              borderColor: u.emcon ? 'var(--status-engaged)' : 'var(--border-default)',
            }}
          >
            {u.emcon ? 'SILENT' : 'RADIATING'}
          </button>
        </div>
      ))}
      {radarUnits.length > 0 && (
        <div style={HINT}>Radar silent: invisible to ELINT, blind without datalink</div>
      )}
    </div>
  )
}
