import { describe, it, expect } from 'vitest'
import { soundForEvent } from '../event-sounds'
import type { SoundName } from '../audio-manager'
import type { GameEvent } from '@/types/game'

const tick = 42
const pos = { lng: 52, lat: 27 }

const cases: [GameEvent, SoundName | null][] = [
  [{ type: 'WAR_DECLARED', attacker: 'usa', defender: 'iran', tick }, 'klaxon'],
  [{ type: 'MISSILE_LAUNCHED', missileId: 'm1', launcherId: 'u1', targetId: 'u2', weaponName: 'Tomahawk', tick }, 'launch-whoosh'],
  [{ type: 'MISSILE_IMPACT', missileId: 'm1', targetId: 'u2', damage: 40, tick }, 'distant-impact'],
  [{ type: 'UNIT_DESTROYED', unitId: 'u2', tick }, 'distant-impact'],
  [{ type: 'MISSILE_INTERCEPTED', missileId: 'm1', interceptorId: 'u3', position: pos, tick }, 'ui-blip'],
  [{ type: 'POINT_DEFENSE_KILL', unitId: 'u3', missileId: 'm1', specId: 'ciws', tick }, 'ui-blip'],
  [{ type: 'AGENT_ARRESTED', agentId: 'a1', codename: 'CYRUS', tick }, 'ui-error'],
  [{ type: 'STRIKE_LEAKED', targetId: 'u2', tick }, 'ui-error'],
  [{ type: 'INTERCEPT_DECRYPTED', precedence: 'FLASH', text: 'launch order intercepted', tick }, 'radio-squelch'],
  [{ type: 'SATELLITE_PASS_COMPLETE', assetId: 's1', target: pos, found: 2, revealedDecoys: 0, tick }, 'sonar-ping'],
  [{ type: 'CEASEFIRE_OFFERED', by: 'iran', tick }, 'radio-squelch'],
  [{ type: 'WAR_ENDED', outcome: 'ceasefire', tick }, 'radio-squelch'],
]

const silentCases: GameEvent[] = [
  { type: 'INTERCEPT_DECRYPTED', precedence: 'ROUTINE', text: 'routine traffic', tick },
  { type: 'INTERCEPT_DECRYPTED', precedence: 'IMMEDIATE', text: 'immediate traffic', tick },
  { type: 'RESUPPLIED', unitId: 'u1', weaponId: 'w1', count: 4, fromBaseId: 'b1', tick },
  { type: 'OIL_PRICE_CHANGE', newPrice: 95, oldPrice: 80, tick },
  { type: 'AGENT_REPORT', agentId: 'a1', codename: 'CYRUS', text: 'report', tick },
  { type: 'SATELLITE_PASS_FAILED', assetId: 's1', target: pos, cloudPct: 80, tick },
  { type: 'ORDER_REJECTED', unitId: 'u1', reason: 'no fuel', tick },
]

describe('soundForEvent', () => {
  it.each(cases.map(([e, expected]) => [e.type, e, expected] as const))(
    'maps %s',
    (_type, e, expected) => {
      expect(soundForEvent(e)).toBe(expected)
    },
  )

  it.each(silentCases.map((e) => [e.type, e] as const))(
    'stays silent for %s',
    (_type, e) => {
      expect(soundForEvent(e)).toBeNull()
    },
  )

  it('only FLASH intercepts squelch', () => {
    const flash: GameEvent = { type: 'INTERCEPT_DECRYPTED', precedence: 'FLASH', text: 'x', tick }
    const priority: GameEvent = { type: 'INTERCEPT_DECRYPTED', precedence: 'PRIORITY', text: 'x', tick }
    expect(soundForEvent(flash)).toBe('radio-squelch')
    expect(soundForEvent(priority)).toBeNull()
  })
})
