import { useMemo } from 'react'
import Panel from '@/components/common/Panel'
import StatBar from '@/components/common/StatBar'
import { useResearchStore } from '@/store/research-store'
import { useGameStore } from '@/store/game-store'
import { techTree, getAvailableTechs } from '@/data/ground/tech-tree'
import type { TechNode } from '@/types/ground'

// ─── Constants ───

const CATEGORIES = ['infantry', 'armor', 'artillery', 'air', 'naval', 'industry', 'electronics'] as const

const CATEGORY_COLORS: Record<string, string> = {
  infantry: 'var(--status-ready)',
  armor: 'var(--status-engaged)',
  artillery: 'var(--status-damaged)',
  air: 'var(--text-accent)',
  naval: '#60a5fa',
  industry: '#fbbf24',
  electronics: '#a78bfa',
}

// ─── Component ───

interface ResearchPanelProps {
  onClose: () => void
}

export default function ResearchPanel({ onClose }: ResearchPanelProps) {
  // Destructured selectors -- never full store in deps
  const selectedCategory = useResearchStore((s) => s.selectedCategory)
  const selectCategory = useResearchStore((s) => s.selectCategory)
  const previewTechId = useResearchStore((s) => s.previewTechId)
  const previewTech = useResearchStore((s) => s.previewTech)

  // Pull from the view state (researchSummary is the serializable snapshot)
  const playerNation = useGameStore((s) => s.viewState.playerNation)
  const researchSummary = useGameStore((s) => s.viewState.researchSummary)

  // Extract player's research summary (or empty default)
  const playerResearch = researchSummary?.[playerNation] ?? {
    current: null,
    progress: 0,
    completed: [] as string[],
  }

  const completedIds = playerResearch.completed
  const completedSet = useMemo(() => new Set(completedIds), [completedIds])

  const availableTechs = useMemo(
    () => getAvailableTechs(completedIds),
    [completedIds],
  )

  const currentTech = playerResearch.current
    ? techTree.find((t) => t.id === playerResearch.current)
    : null

  // Filter available techs by category
  const filteredTechs = selectedCategory
    ? availableTechs.filter((t) => t.category === selectedCategory)
    : availableTechs

  const previewNode = previewTechId
    ? techTree.find((t) => t.id === previewTechId)
    : null

  return (
    <Panel
      title="Research"
      onClose={onClose}
      style={{ position: 'absolute', top: 60, right: 12, minWidth: 300 }}
    >
      {/* Current research */}
      <div style={{
        marginBottom: 12,
        padding: '8px',
        background: 'var(--bg-hover)',
        borderRadius: 4,
        borderLeft: '3px solid var(--text-accent)',
      }}>
        <div style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          marginBottom: 4,
          letterSpacing: '0.05em',
        }}>
          Researching
        </div>
        {currentTech ? (
          <>
            <div style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              marginBottom: 4,
            }}>
              {currentTech.name}
            </div>
            <StatBar
              label="PROGRESS"
              value={Math.round(playerResearch.progress)}
              max={currentTech.cost}
              color="var(--text-accent)"
            />
          </>
        ) : (
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
          }}>
            No active research
          </div>
        )}
      </div>

      {/* Budget slider (read-only until team lead wires the command) */}
      <div style={{
        marginBottom: 12,
        padding: '6px 8px',
        background: 'var(--bg-hover)',
        borderRadius: 4,
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}>
          <span style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
          }}>
            Research Budget
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={50}
          defaultValue={15}
          disabled
          style={{
            width: '100%',
            accentColor: 'var(--text-accent)',
            cursor: 'not-allowed',
            opacity: 0.7,
          }}
        />
      </div>

      {/* Category filter tabs */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 3,
        marginBottom: 10,
      }}>
        <FilterButton
          label="ALL"
          active={selectedCategory === null}
          color="var(--text-accent)"
          onClick={() => selectCategory(null)}
        />
        {CATEGORIES.map((cat) => (
          <FilterButton
            key={cat}
            label={cat.toUpperCase()}
            active={selectedCategory === cat}
            color={CATEGORY_COLORS[cat] ?? 'var(--text-accent)'}
            onClick={() => selectCategory(cat)}
          />
        ))}
      </div>

      {/* Tech list */}
      <div style={{
        maxHeight: 240,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        {filteredTechs.length === 0 && (
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            padding: '8px 0',
          }}>
            No techs available in this category.
          </div>
        )}
        {filteredTechs.map((tech: TechNode) => (
          <TechRow
            key={tech.id}
            tech={tech}
            isActive={previewTechId === tech.id}
            isBeingResearched={playerResearch.current === tech.id}
            onClick={() => previewTech(previewTechId === tech.id ? null : tech.id)}
          />
        ))}
      </div>

      {/* Completed techs count */}
      <div style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1px solid var(--border-default)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-muted)',
      }}>
        Completed: {completedIds.length} / {techTree.length} techs
      </div>

      {/* Preview pane */}
      {previewNode && <TechPreview tech={previewNode} completedTechs={completedSet} />}
    </Panel>
  )
}

// ─── Sub-components ───

function FilterButton({ label, active, color, onClick }: {
  label: string
  active: boolean
  color: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 6px',
        background: active ? color : 'var(--bg-hover)',
        border: active ? `1px solid ${color}` : '1px solid var(--border-default)',
        borderRadius: 3,
        color: active ? 'var(--bg-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        fontWeight: active ? 700 : 400,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
      }}
    >
      {label}
    </button>
  )
}

function TechRow({ tech, isActive, isBeingResearched, onClick }: {
  tech: TechNode
  isActive: boolean
  isBeingResearched: boolean
  onClick: () => void
}) {
  const catColor = (tech.category ? CATEGORY_COLORS[tech.category] : undefined) ?? 'var(--text-accent)'
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '6px 8px',
        background: isActive ? 'var(--bg-hover)' : 'transparent',
        border: isActive ? `1px solid ${catColor}` : '1px solid transparent',
        borderRadius: 4,
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}>
          {tech.name}
        </span>
        <span style={{
          fontSize: '10px',
          color: catColor,
          textTransform: 'uppercase',
        }}>
          {tech.category}
        </span>
      </div>
      <div style={{
        fontSize: '10px',
        color: 'var(--text-muted)',
        marginTop: 2,
      }}>
        Cost: {tech.cost} pts
        {isBeingResearched && (
          <span style={{ color: 'var(--text-accent)', marginLeft: 8 }}>
            [IN PROGRESS]
          </span>
        )}
      </div>
    </button>
  )
}

function TechPreview({ tech, completedTechs }: {
  tech: TechNode
  completedTechs: Set<string>
}) {
  return (
    <div style={{
      marginTop: 10,
      padding: '8px',
      background: 'var(--bg-hover)',
      borderRadius: 4,
      borderLeft: `3px solid ${(tech.category ? CATEGORY_COLORS[tech.category] : undefined) ?? 'var(--text-accent)'}`,
    }}>
      <div style={{
        fontSize: 'var(--font-size-sm)',
        color: 'var(--text-primary)',
        fontWeight: 600,
        marginBottom: 4,
      }}>
        {tech.name}
      </div>
      <div style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
        lineHeight: 1.4,
        marginBottom: 6,
      }}>
        {tech.description}
      </div>

      {/* Prerequisites */}
      {tech.prerequisites.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <span style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
          }}>
            Requires:{' '}
          </span>
          {tech.prerequisites.map((prereq: string, i: number) => {
            const met = completedTechs.has(prereq)
            return (
              <span key={prereq} style={{
                fontSize: '10px',
                color: met ? 'var(--status-ready)' : 'var(--status-damaged)',
              }}>
                {prereq.replace(/_/g, ' ')}
                {i < tech.prerequisites.length - 1 ? ', ' : ''}
              </span>
            )
          })}
        </div>
      )}

      {/* Effects */}
      <div>
        <span style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
        }}>
          Effects:
        </span>
        {tech.effects.map((eff: TechNode['effects'][number], i: number) => (
          <div key={i} style={{
            fontSize: '10px',
            color: 'var(--text-secondary)',
            paddingLeft: 8,
            marginTop: 2,
          }}>
            {'description' in eff ? (eff as { description?: string }).description : JSON.stringify(eff)}
          </div>
        ))}
      </div>
    </div>
  )
}
