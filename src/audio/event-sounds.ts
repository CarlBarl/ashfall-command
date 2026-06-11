import type { GameEvent } from '@/types/game'
import type { SoundName } from './audio-manager'

/**
 * Pure event→sound table. The own-unit-destroyed klaxon overlay lives in
 * useSoundEffects — it needs viewState to resolve the unit's nation.
 */
export function soundForEvent(e: GameEvent): SoundName | null {
  switch (e.type) {
    case 'WAR_DECLARED':
      return 'klaxon'
    case 'MISSILE_LAUNCHED':
      return 'launch-whoosh'
    case 'MISSILE_IMPACT':
    case 'UNIT_DESTROYED':
      return 'distant-impact'
    case 'MISSILE_INTERCEPTED':
    case 'POINT_DEFENSE_KILL':
      return 'ui-blip'
    case 'AGENT_ARRESTED':
    case 'STRIKE_LEAKED':
      return 'ui-error'
    case 'INTERCEPT_DECRYPTED':
      return e.precedence === 'FLASH' ? 'radio-squelch' : null
    case 'SATELLITE_PASS_COMPLETE':
      return 'sonar-ping'
    case 'CEASEFIRE_OFFERED':
    case 'WAR_ENDED':
      return 'radio-squelch'
    default:
      return null
  }
}
