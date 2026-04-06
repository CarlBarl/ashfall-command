/**
 * WW2-era tech tree — research nodes from 1933 to 1945.
 * Each node has prerequisites, costs, and gameplay effects.
 */

import type { TechNode } from '@/types/ground'

export const techTree: TechNode[] = [
  // ── 1930s (base techs) ──────────────────────────────────────────

  {
    id: 'basic_infantry',
    name: 'Basic Infantry Doctrine',
    description: 'Standardized infantry training and equipment. Unlocks infantry divisions.',
    year: 1933,
    cost: 100,
    prerequisites: [],
    effects: [
      { type: 'unlock_unit', target: 'infantry', description: 'Unlocks infantry divisions' },
    ],
  },
  {
    id: 'light_tanks',
    name: 'Light Tank Development',
    description: 'Early armored vehicles — Panzer I, T-26, M2 Light. Fast but lightly armored.',
    year: 1934,
    cost: 150,
    prerequisites: [],
    effects: [
      { type: 'unlock_unit', target: 'armor', description: 'Unlocks light armor divisions' },
    ],
  },
  {
    id: 'field_artillery',
    name: 'Field Artillery',
    description: 'Towed howitzers and field guns — 75mm to 105mm caliber.',
    year: 1933,
    cost: 120,
    prerequisites: [],
    effects: [
      { type: 'unlock_unit', target: 'artillery', description: 'Unlocks artillery divisions' },
    ],
  },

  // ── 1939-1942 (early war) ───────────────────────────────────────

  {
    id: 'medium_tanks',
    name: 'Medium Tank Design',
    description: 'Heavier armor and better guns — Panzer III/IV, T-34, M4 Sherman.',
    year: 1939,
    cost: 200,
    prerequisites: ['light_tanks'],
    effects: [
      { type: 'unlock_unit', target: 'armor', description: 'Unlocks Panzer III/IV, T-34, Sherman' },
      { type: 'stat_bonus', target: 'armor', stat: 'attackPower', value: 0.15, description: '+15% armor attack power' },
    ],
  },
  {
    id: 'improved_infantry',
    name: 'Improved Infantry Tactics',
    description: 'Combined arms doctrine, better squad tactics, improved small arms.',
    year: 1940,
    cost: 150,
    prerequisites: ['basic_infantry'],
    effects: [
      { type: 'stat_bonus', target: 'infantry', stat: 'defensePower', value: 0.10, description: '+10% infantry defense' },
    ],
  },
  {
    id: 'heavy_artillery',
    name: 'Heavy Artillery',
    description: '150mm+ howitzers and railway guns for siege and breakthrough.',
    year: 1940,
    cost: 180,
    prerequisites: ['field_artillery'],
    effects: [
      { type: 'stat_bonus', target: 'artillery', stat: 'attackPower', value: 0.20, description: '+20% artillery attack power' },
    ],
  },

  // ── 1943-1945 (late war) ────────────────────────────────────────

  {
    id: 'heavy_tanks',
    name: 'Heavy Tank Program',
    description: 'Heavily armored breakthrough tanks — Tiger, Panther, IS-2, Pershing.',
    year: 1943,
    cost: 300,
    prerequisites: ['medium_tanks'],
    effects: [
      { type: 'unlock_unit', target: 'armor', description: 'Unlocks Tiger, Panther, IS-2' },
      { type: 'stat_bonus', target: 'armor', stat: 'attackPower', value: 0.25, description: '+25% armor attack power' },
      { type: 'stat_bonus', target: 'armor', stat: 'defensePower', value: 0.20, description: '+20% armor defense power' },
    ],
  },
  {
    id: 'rocket_artillery',
    name: 'Rocket Artillery',
    description: 'Multiple launch rocket systems — Katyusha, Nebelwerfer. Area saturation fire.',
    year: 1943,
    cost: 250,
    prerequisites: [],
    effects: [
      { type: 'unlock_weapon', target: 'rocket_artillery', description: 'Unlocks Katyusha-style rocket artillery' },
      { type: 'stat_bonus', target: 'artillery', stat: 'attackPower', value: 0.15, description: '+15% artillery area attack' },
    ],
  },
  {
    id: 'v2_rocket',
    name: 'V-2 Ballistic Missile',
    description: 'First operational ballistic missile. Bridges to modern missile warfare.',
    year: 1944,
    cost: 400,
    prerequisites: [],
    effects: [
      { type: 'unlock_weapon', target: 'ballistic_missile', description: 'Unlocks V-2 ballistic missiles' },
    ],
  },
]

/** Look up a tech node by ID */
export function getTechNode(id: string): TechNode | undefined {
  return techTree.find(t => t.id === id)
}

/** Get all techs available given a set of completed techs */
export function getAvailableTechs(completedTechIds: string[]): TechNode[] {
  const completed = new Set(completedTechIds)
  return techTree.filter(tech => {
    if (completed.has(tech.id)) return false
    return tech.prerequisites.every(prereqId => completed.has(prereqId))
  })
}
