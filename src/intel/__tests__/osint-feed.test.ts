import { describe, it, expect } from 'vitest'
import { generatePostsForEvent } from '../osint-feed'
import { OSINT_ACCOUNTS } from '@/data/intel/osint-accounts'
import type { GameEvent } from '@/types/game'

const names = new Map<string, string>([
  ['al_udeid', 'Al Udeid Air Base'],
  ['cvn72_lincoln', 'CVN-72 Abraham Lincoln CSG'],
  ['shahab_tabriz', 'Shahab-3 TEL (Tabriz)'],
  ['irgc_fac', 'IRGC FAC Group (Hormuz)'],
])

const launched: GameEvent = {
  type: 'MISSILE_LAUNCHED', missileId: 'm1', launcherId: 'shahab_tabriz',
  targetId: 'al_udeid', weaponName: 'Shahab-3', tick: 500,
}
const impact: GameEvent = { type: 'MISSILE_IMPACT', missileId: 'm1', targetId: 'al_udeid', damage: 40, tick: 900 }
const destroyedIranian: GameEvent = { type: 'UNIT_DESTROYED', unitId: 'irgc_fac', tick: 1200 }
const warDeclared: GameEvent = { type: 'WAR_DECLARED', attacker: 'usa', defender: 'iran', tick: 10 }
const mineHit: GameEvent = { type: 'MINE_CONTACT', minefieldId: 'mf1', targetId: 'cvn72_lincoln', damage: 25, tick: 333 }
const laneChange: GameEvent = {
  type: 'SHIPPING_LANE_STATUS_CHANGE', laneId: 'hormuz', newStatus: 'blocked', suppressionFactor: 1, tick: 700,
}
const oilSpike: GameEvent = { type: 'OIL_PRICE_CHANGE', newPrice: 142, oldPrice: 96, tick: 800 }
const flashIntercept: GameEvent = {
  type: 'INTERCEPT_DECRYPTED', precedence: 'FLASH', text: 'missile brigade ordered to combat readiness', tick: 60,
}
const routineIntercept: GameEvent = { type: 'INTERCEPT_DECRYPTED', precedence: 'ROUTINE', text: 'logistics chatter', tick: 61 }
const supportCritical: GameEvent = { type: 'WAR_SUPPORT_CRITICAL', nation: 'usa', support: 28, tick: 5000 }
const usaMission: GameEvent = {
  type: 'AIR_MISSION_LAUNCHED', missionId: 'am_1_1500', kind: 'strike', flightName: '2× F/A-18E (VFA-14)', tick: 1500,
}
const iranMission: GameEvent = {
  type: 'AIR_MISSION_LAUNCHED', missionId: 'am_2_1600', kind: 'cap', flightName: '2× MiG-29A (11th TFS Fulcrums)', tick: 1600,
}
const flightLost: GameEvent = {
  type: 'FLIGHT_LOST', missionId: 'am_1_1500', flightName: '2× F/A-18E (VFA-14)', airframesLost: 2, pilotFate: 'pow', tick: 2000,
}
const airIntercept: GameEvent = {
  type: 'AIR_INTERCEPT', attackerName: '2× Su-35SE (Su-35SE Group)', defenderName: '2× F/A-18E (VFA-14)', kills: 1, tick: 2100,
}

function account(handle: string) {
  return OSINT_ACCOUNTS.find((a) => a.handle === handle)!
}

function postsBy(posts: ReturnType<typeof generatePostsForEvent>, handle: string) {
  return posts.filter((p) => p.handle === handle)
}

describe('generatePostsForEvent — archetype coverage', () => {
  it('plane spotter covers launches and auto-engagements', () => {
    expect(postsBy(generatePostsForEvent(launched, names, 500), '@GulfPlaneWatch')).toHaveLength(1)
    const engage: GameEvent = {
      type: 'AUTO_ENGAGEMENT', unitId: 'cvn72_lincoln', targetId: 'irgc_fac',
      weaponName: 'SM-6', count: 2, quality: 'own', tick: 50,
    }
    expect(postsBy(generatePostsForEvent(engage, names, 50), '@GulfPlaneWatch')).toHaveLength(1)
  })

  it('aggregator covers impact, destruction and war declaration', () => {
    expect(postsBy(generatePostsForEvent(impact, names, 900), '@CENTCOM_Watch')).toHaveLength(1)
    expect(postsBy(generatePostsForEvent(destroyedIranian, names, 1200), '@CENTCOM_Watch')).toHaveLength(1)
    const war = postsBy(generatePostsForEvent(warDeclared, names, 10), '@CENTCOM_Watch')
    expect(war).toHaveLength(1)
    expect(war[0].text).toMatch(/USA/)
    expect(war[0].text).toMatch(/IRAN/)
  })

  it('webcam watcher covers mine hits and lane status', () => {
    expect(postsBy(generatePostsForEvent(mineHit, names, 333), '@StraitSpotter')).toHaveLength(1)
    expect(postsBy(generatePostsForEvent(laneChange, names, 700), '@StraitSpotter')).toHaveLength(1)
  })

  it('regime mouthpiece inflates Iranian launches and denies Iranian losses', () => {
    expect(postsBy(generatePostsForEvent(launched, names, 500), '@IRGC_Media')).toHaveLength(1)
    expect(postsBy(generatePostsForEvent(destroyedIranian, names, 1200), '@IRGC_Media')).toHaveLength(1)
    // US weapon launch is not an Iranian launch — no inflated claim
    const usLaunch: GameEvent = {
      type: 'MISSILE_LAUNCHED', missileId: 'm2', launcherId: 'cvn72_lincoln',
      targetId: 'irgc_fac', weaponName: 'BGM-109 Tomahawk', tick: 501,
    }
    expect(postsBy(generatePostsForEvent(usLaunch, names, 501), '@IRGC_Media')).toHaveLength(0)
    // US loss draws no denial
    const usLoss: GameEvent = { type: 'UNIT_DESTROYED', unitId: 'al_udeid', tick: 1300 }
    expect(postsBy(generatePostsForEvent(usLoss, names, 1300), '@IRGC_Media')).toHaveLength(0)
  })

  it('oil analyst covers price moves and lane status', () => {
    const oil = postsBy(generatePostsForEvent(oilSpike, names, 800), '@TankerTrackerz')
    expect(oil).toHaveLength(1)
    expect(oil[0].text).toContain('142')
    expect(postsBy(generatePostsForEvent(laneChange, names, 700), '@TankerTrackerz')).toHaveLength(1)
  })

  it('imagery analyst posts delayed BDA after impacts', () => {
    const bda = postsBy(generatePostsForEvent(impact, names, 900), '@OrbitalRecon')
    expect(bda).toHaveLength(1)
    expect(bda[0].text).toContain('Al Udeid Air Base')
  })

  it('leak channel reposts FLASH intercepts only', () => {
    const flash = postsBy(generatePostsForEvent(flashIntercept, names, 60), '@SignalDesk')
    expect(flash).toHaveLength(1)
    expect(flash[0].text).toContain('missile brigade ordered to combat readiness')
    expect(postsBy(generatePostsForEvent(routineIntercept, names, 61), '@SignalDesk')).toHaveLength(0)
  })

  it('joke indicator posts on war-support critical', () => {
    expect(postsBy(generatePostsForEvent(supportCritical, names, 5000), '@PizzaIndexGulf')).toHaveLength(1)
  })

  it('plane spotter covers USA air-mission launches but not Iranian ones', () => {
    expect(postsBy(generatePostsForEvent(usaMission, names, 1500), '@GulfPlaneWatch')).toHaveLength(1)
    expect(postsBy(generatePostsForEvent(iranMission, names, 1600), '@GulfPlaneWatch')).toHaveLength(0)
  })

  it('plane spotter covers air-to-air intercepts', () => {
    expect(postsBy(generatePostsForEvent(airIntercept, names, 2100), '@GulfPlaneWatch')).toHaveLength(1)
    const noKill: GameEvent = { ...airIntercept, kills: 0, tick: 2101 }
    expect(postsBy(generatePostsForEvent(noKill, names, 2101), '@GulfPlaneWatch')).toHaveLength(1)
  })

  it('aggregator covers downed flights', () => {
    const posts = postsBy(generatePostsForEvent(flightLost, names, 2000), '@CENTCOM_Watch')
    expect(posts).toHaveLength(1)
    expect(posts[0].text).toMatch(/down over the Gulf|reported lost|failed to return/)
    const kia: GameEvent = { type: 'FLIGHT_LOST', flightName: '2× F-14AM (81st TFS Tomcats)', airframesLost: 1, pilotFate: 'kia', tick: 2200 }
    expect(postsBy(generatePostsForEvent(kia, names, 2200), '@CENTCOM_Watch')).toHaveLength(1)
  })

  it('uncovered events generate nothing', () => {
    const repair: GameEvent = { type: 'UNIT_REPAIRED', unitId: 'al_udeid', healthRestored: 10, tick: 42 }
    expect(generatePostsForEvent(repair, names, 42)).toHaveLength(0)
  })
})

describe('generatePostsForEvent — delay semantics', () => {
  it('every post surfaces no earlier than event tick + the account min delay', () => {
    const allEvents = [launched, impact, destroyedIranian, mineHit, laneChange, oilSpike, flashIntercept, supportCritical, usaMission, flightLost, airIntercept]
    for (const e of allEvents) {
      for (const post of generatePostsForEvent(e, names, e.tick)) {
        const [min, max] = account(post.handle).delayRangeSec
        expect(post.tick).toBeGreaterThanOrEqual(e.tick + min)
        expect(post.tick).toBeLessThanOrEqual(e.tick + max)
      }
    }
  })

  it('imagery analyst BDA is hours late, plane spotter is minutes late', () => {
    const posts = generatePostsForEvent(impact, names, 900)
    const bda = postsBy(posts, '@OrbitalRecon')[0]
    expect(bda.tick).toBeGreaterThanOrEqual(900 + 21_600)
    const spotter = postsBy(generatePostsForEvent(launched, names, 500), '@GulfPlaneWatch')[0]
    expect(spotter.tick).toBeLessThanOrEqual(500 + 180)
  })

  it('never schedules a post before the current tick when events are consumed late', () => {
    const late = generatePostsForEvent(launched, names, 99_999)
    for (const post of late) {
      expect(post.tick).toBeGreaterThanOrEqual(99_999)
    }
  })
})

describe('generatePostsForEvent — determinism', () => {
  it('identical input produces identical posts', () => {
    const a = generatePostsForEvent(impact, names, 900)
    const b = generatePostsForEvent(impact, names, 900)
    expect(a).toEqual(b)
  })

  it('different event ticks vary delay and text choice deterministically', () => {
    const later: GameEvent = { ...impact, tick: 901 }
    const a = generatePostsForEvent(impact, names, 900)
    const b = generatePostsForEvent(later, names, 901)
    expect(a.length).toBe(b.length)
    expect(generatePostsForEvent(later, names, 901)).toEqual(b)
  })
})
