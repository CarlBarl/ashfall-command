import type { ScenarioDefinition } from '@/types/scenario'
import { persianGulf2026 } from './usa-iran-2026'
import { fallWeiss1939 } from './fall-weiss-1939'

export const scenarios: ScenarioDefinition[] = [persianGulf2026, fallWeiss1939]

export function getScenario(id: string): ScenarioDefinition | undefined {
  return scenarios.find(s => s.id === id)
}
