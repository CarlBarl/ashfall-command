import { describe, it, expect, beforeEach } from 'vitest'
import { processResearch, resetResearchState } from '../research'
import type { GameState, GameEvent } from '@/types/game'
import type { ResearchState, TechId } from '@/types/ground'

// ── Helpers ─────────────────────────────────────────────────────

function makeResearchState(overrides: Partial<ResearchState> = {}): ResearchState {
  return {
    currentResearch: null,
    researchProgress: 0,
    monthlyBudget: 50,
    completedTechs: new Set<TechId>(overrides.completedTechs ?? []),
    ...overrides,
    // Re-set completedTechs after spread to ensure it's always a Set
  }
}

function makeGameState(options: {
  research?: Map<string, ResearchState>
  tick?: number
}): GameState {
  const state: GameState = {
    playerNation: 'usa',
    initialized: true,
    time: { tick: options.tick ?? 720, timestamp: Date.now(), speed: 1, tickIntervalMs: 100 },
    nations: {
      usa: { id: 'usa', name: 'USA', economy: { gdp_billions: 28000, military_budget_billions: 886, military_budget_pct_gdp: 3.2, oil_revenue_billions: 0, sanctions_impact: 0, war_cost_per_day_millions: 0, reserves_billions: 800 }, relations: { usa: 100, iran: -60 }, atWar: [] },
      iran: { id: 'iran', name: 'Iran', economy: { gdp_billions: 400, military_budget_billions: 25, military_budget_pct_gdp: 6.3, oil_revenue_billions: 50, sanctions_impact: 0.3, war_cost_per_day_millions: 0, reserves_billions: 120 }, relations: { usa: -60, iran: 100 }, atWar: [] },
    },
    units: new Map(),
    missiles: new Map(),
    engagements: new Map(),
    supplyLines: new Map(),
    events: [],
    pendingEvents: [],
    research: options.research ?? new Map([
      ['usa', makeResearchState()],
      ['iran', makeResearchState()],
    ]),
  } as GameState

  return state
}

// ── Tests ───────────────────────────────────────────────────────

describe('processResearch', () => {
  beforeEach(() => {
    resetResearchState()
  })

  it('accumulates monthly research progress', () => {
    const state = makeGameState({
      research: new Map([
        ['usa', makeResearchState({ currentResearch: 'basic_infantry', monthlyBudget: 50, researchProgress: 0 })],
        ['iran', makeResearchState()],
      ]),
      tick: 720,
    })

    processResearch(state)

    const rs = state.research!.get('usa')!
    expect(rs.researchProgress).toBe(50)
    // Still researching
    expect(rs.currentResearch).toBe('basic_infantry')
  })

  it('completes tech when progress >= cost', () => {
    const state = makeGameState({
      research: new Map([
        ['usa', makeResearchState({ currentResearch: 'basic_infantry', monthlyBudget: 60, researchProgress: 50 })],
        ['iran', makeResearchState()],
      ]),
      tick: 720,
    })

    processResearch(state)

    const rs = state.research!.get('usa')!
    // basic_infantry costs 100, progress was 50 + 60 = 110 >= 100
    expect(rs.completedTechs.has('basic_infantry' as TechId)).toBe(true)
    expect(rs.currentResearch).toBeNull()
    expect(rs.researchProgress).toBe(0)
  })

  it('emits TECH_COMPLETED event on completion', () => {
    const state = makeGameState({
      research: new Map([
        ['usa', makeResearchState({ currentResearch: 'basic_infantry', monthlyBudget: 200, researchProgress: 0 })],
        ['iran', makeResearchState()],
      ]),
      tick: 720,
    })

    processResearch(state)

    const techEvents = state.pendingEvents.filter(e => e.type === 'TECH_COMPLETED')
    expect(techEvents.length).toBe(1)
    const evt = techEvents[0] as Extract<GameEvent, { type: 'TECH_COMPLETED' }>
    expect(evt.nation).toBe('usa')
    expect(evt.techId).toBe('basic_infantry')
  })

  it('checks prerequisites before allowing research', () => {
    // medium_tanks requires light_tanks — should not allow research without it
    const state = makeGameState({
      research: new Map([
        ['usa', makeResearchState({
          currentResearch: 'medium_tanks',
          monthlyBudget: 500,
          researchProgress: 0,
          completedTechs: new Set<TechId>(), // No light_tanks completed!
        })],
        ['iran', makeResearchState()],
      ]),
      tick: 720,
    })

    processResearch(state)

    const rs = state.research!.get('usa')!
    // Should have cancelled research — prerequisites not met
    expect(rs.currentResearch).toBeNull()
    expect(rs.completedTechs.has('medium_tanks' as TechId)).toBe(false)
  })

  it('allows research when prerequisites are met', () => {
    const state = makeGameState({
      research: new Map([
        ['usa', makeResearchState({
          currentResearch: 'medium_tanks',
          monthlyBudget: 500,
          researchProgress: 0,
          completedTechs: new Set<TechId>(['light_tanks' as TechId]), // Prereq met!
        })],
        ['iran', makeResearchState()],
      ]),
      tick: 720,
    })

    processResearch(state)

    const rs = state.research!.get('usa')!
    // Should complete (500 >= 200 cost)
    expect(rs.completedTechs.has('medium_tanks' as TechId)).toBe(true)
  })

  it('does not process on wrong tick', () => {
    const state = makeGameState({
      research: new Map([
        ['usa', makeResearchState({ currentResearch: 'basic_infantry', monthlyBudget: 50, researchProgress: 0 })],
        ['iran', makeResearchState()],
      ]),
      tick: 100, // Not divisible by 720
    })

    processResearch(state)

    const rs = state.research!.get('usa')!
    expect(rs.researchProgress).toBe(0)
  })

  it('processes multiple nations independently', () => {
    const state = makeGameState({
      research: new Map([
        ['usa', makeResearchState({ currentResearch: 'basic_infantry', monthlyBudget: 200, researchProgress: 0 })],
        ['iran', makeResearchState({ currentResearch: 'field_artillery', monthlyBudget: 200, researchProgress: 0 })],
      ]),
      tick: 720,
    })

    processResearch(state)

    const usaRs = state.research!.get('usa')!
    const iranRs = state.research!.get('iran')!
    expect(usaRs.completedTechs.has('basic_infantry' as TechId)).toBe(true)
    expect(iranRs.completedTechs.has('field_artillery' as TechId)).toBe(true)
  })

  it('does nothing when no currentResearch is set', () => {
    const state = makeGameState({
      research: new Map([
        ['usa', makeResearchState({ currentResearch: null, monthlyBudget: 50, researchProgress: 0 })],
        ['iran', makeResearchState()],
      ]),
      tick: 720,
    })

    processResearch(state)

    const rs = state.research!.get('usa')!
    expect(rs.researchProgress).toBe(0)
    expect(rs.completedTechs.size).toBe(0)
  })
})
