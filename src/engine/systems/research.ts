/**
 * Research system — tech tree progression for each nation.
 * Runs every 720 ticks (= 30 days in game time).
 *
 * Each nation can research one tech at a time. Monthly budget is added
 * to progress. When progress >= cost, the tech completes.
 */

import type { GameState } from '@/types/game'
import type { ResearchState } from '@/types/ground'
import type { GameEvent } from '@/types/game'
import { getTechNode } from '@/data/ground/tech-tree'

const TICKS_PER_MONTH = 720

// ── Module state ──────────────────────────────────────────────

/** Reset module-level state — must be called on save/load */
export function resetResearchState(): void {
  // Reserved for future caches
}

// ── Extended state accessors ──────────────────────────────────

function getResearch(state: GameState): Map<string, ResearchState> | undefined {
  return state.research
}

// ── Main processing ───────────────────────────────────────────

export function processResearch(state: GameState): void {
  if (state.time.tick % TICKS_PER_MONTH !== 0) return

  const research = getResearch(state)
  if (!research) return

  for (const [nationId, rs] of research) {
    if (!rs.currentResearch) continue

    const techNode = getTechNode(rs.currentResearch)
    if (!techNode) {
      // Invalid tech — cancel research
      rs.currentResearch = null
      rs.researchProgress = 0
      continue
    }

    // Check prerequisites
    const prereqsMet = techNode.prerequisites.every(prereqId =>
      rs.completedTechs.has(prereqId),
    )
    if (!prereqsMet) {
      // Prerequisites not met — cancel research
      rs.currentResearch = null
      rs.researchProgress = 0
      continue
    }

    // Add monthly budget to progress
    rs.researchProgress += rs.monthlyBudget

    // Check completion
    if (rs.researchProgress >= techNode.cost) {
      // Complete the tech
      rs.completedTechs.add(techNode.id)

      // Emit completion event
      const event: GameEvent = {
        type: 'TECH_COMPLETED',
        nation: nationId as 'usa' | 'iran',
        techId: techNode.id,
        techName: techNode.name,
        tick: state.time.tick,
      }
      state.pendingEvents.push(event)

      // Reset for next research
      rs.currentResearch = null
      rs.researchProgress = 0
    }
  }
}

/** Get the tech tree (re-export for convenience) */
export { techTree, getTechNode, getAvailableTechs } from '@/data/ground/tech-tree'
