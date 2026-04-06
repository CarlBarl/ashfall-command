import type { ScenarioDefinition, ScenarioData } from '@/types/scenario'
import type { Nation } from '@/types/game'
import type { ResearchState } from '@/types/ground'
import { germanGroundUnits, germanGenerals, germanArmyGroups } from '@/data/ground/germany-orbat-1939'
import { polishGroundUnits, polishGenerals, polishArmyGroups } from '@/data/ground/poland-orbat-1939'
import { createCentralEuropeGrid } from '@/data/ground/terrain-central-europe'
import { germanyEconomy } from '@/data/nations/germany'
import { polandEconomy } from '@/data/nations/poland'

function buildData(): ScenarioData {
  const nations: Record<string, Nation> = {
    germany: {
      id: 'germany' as string,
      name: 'Third Reich',
      economy: germanyEconomy,
      relations: { germany: 100, poland: -80 },
      atWar: ['poland' as string],
    },
    poland: {
      id: 'poland' as string,
      name: 'Second Polish Republic',
      economy: polandEconomy,
      relations: { germany: -80, poland: 100 },
      atWar: ['germany' as string],
    },
  }

  // Both nations start with base techs already researched (1939 start)
  const initialResearch: Record<string, ResearchState> = {
    germany: {
      completedTechs: new Set(['basic_infantry', 'light_tanks', 'field_artillery']),
      currentResearch: 'medium_tanks',
      researchProgress: 80, // Germany was close to fielding Panzer III/IV en masse
      monthlyBudget: 25,
    },
    poland: {
      completedTechs: new Set(['basic_infantry', 'field_artillery']),
      currentResearch: 'improved_infantry',
      researchProgress: 20, // Poland was behind on modernization
      monthlyBudget: 8,
    },
  }

  return {
    nations,
    units: [],            // No naval/air units in this ground-only scenario (PoC)
    supplyLines: [],      // Ground supply handled by control grid connectivity
    baseSupply: {},
    groundUnits: [...germanGroundUnits, ...polishGroundUnits],
    generals: [...germanGenerals, ...polishGenerals],
    armyGroups: [...germanArmyGroups, ...polishArmyGroups],
    controlGrid: createCentralEuropeGrid(),
    initialResearch,
    // tickScale omitted — 1 tick = 1 second, same as modern scenario
  }
}

export const fallWeiss1939: ScenarioDefinition = {
  id: 'fall-weiss-1939',
  name: 'Fall Weiss: Invasion of Poland (1939)',
  description:
    'September 1, 1939. Germany launches Fall Weiss (Case White), the invasion of Poland. ' +
    'Two army groups — North under Bock and South under Rundstedt — strike from Silesia, ' +
    'Pomerania, and East Prussia. Poland must hold the line along the frontier with ' +
    'outnumbered but determined forces. Ground warfare PoC with divisions, generals, ' +
    'control grid, and tech tree.',
  year: 1939,
  startDate: '1939-09-01T04:45:00Z',
  nations: ['germany' as string, 'poland' as string],
  defaultPlayerNation: 'germany' as string,
  mapCenter: { longitude: 20.0, latitude: 51.5, zoom: 5.5 },
  borderGeojsonPath: '/geo/europe_1939.geojson',
  getData: buildData,
}
