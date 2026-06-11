/**
 * Diegetic OSINT feed — pure consumer of the snapshot event stream.
 * Design: docs/plans/intel-suite-v3.md §2. The engine never sees this;
 * posts are presentation derived from events the player already received.
 */
import { useEffect } from 'react'
import { create } from 'zustand'
import { useGameStore } from '@/store/game-store'
import { OSINT_ACCOUNTS, type OsintAccount } from '@/data/intel/osint-accounts'
import type { GameEvent } from '@/types/game'

export interface OsintPost {
  id: string
  handle: string
  displayName: string
  color: string
  /** Game tick the post surfaces at (event tick + the account's reporting delay) */
  tick: number
  text: string
}

const PUBLISHED_CAP = 100

// ── Deterministic randomness ────────────────────────────────────────────────
// LCG keyed on (event tick + type + handle) so re-renders/replays produce
// identical posts. Never Math.random() here — this runs in render-adjacent paths.

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]
}

// ── Nation heuristics (events carry no nation field; the feed is flavor) ────

const IRAN_WEAPON_RE = /shahab|sejjil|fateh|zolfaghar|khalij|noor|soumar|hoveyzeh|shahed|sayyad|bavar|khordad|48n6|9m331/i
const USA_FLIGHT_RE = /f\/a-18|f-35|ea-18|e-2|hornet|lightning|growler|hawkeye|vfa|vaq|vaw|efs/i
const IRAN_UNIT_RE = /irgc|irin|bandar|bushehr|qeshm|jask|chabahar|khordad|bavar|s-300|tor-m1|shahab|sejjil|fateh|zolfaghar|shahed|soumar|ghadir|mehrabad|nebo|isfahan|tabriz|dezful|semnan|natanz|kermanshah|khorramabad|shiraz|tehran|\btel\b/i

const WRONG_NAMES = [
  'the Sirri complex',
  'a facility near Lavan',
  'the Asaluyeh site',
  'a position outside Minab',
  'the Kish installation',
]

function nameOf(id: string, names: Map<string, string>): string {
  return names.get(id) ?? id
}

// ── Per-archetype text generators ───────────────────────────────────────────
// Return null when the account does not cover the event.

function buildText(
  account: OsintAccount,
  event: GameEvent,
  names: Map<string, string>,
  rng: () => number,
): string | null {
  switch (account.archetype) {
    case 'plane_spotter': {
      if (event.type === 'MISSILE_LAUNCHED') {
        return pick(rng, [
          `launch flash on the horizon, multiple plumes climbing. ${event.weaponName}? thread when I have photos`,
          'whole building shook from the launch roar. something big just went up',
          'to everyone DMing: yes, confirmed launch activity near the base. stay indoors',
        ])
      }
      if (event.type === 'AUTO_ENGAGEMENT') {
        return pick(rng, [
          `air defense going loud RIGHT NOW — ${event.weaponName} x${event.count} per my count`,
          'interceptors going up in pairs over the water. camera rolling',
          `that sound is live ${event.weaponName} fire. engagement underway`,
        ])
      }
      if (event.type === 'AIR_MISSION_LAUNCHED' && USA_FLIGHT_RE.test(event.flightName)) {
        return pick(rng, [
          `${event.flightName} just launched — climbing out fast and heading seaward`,
          'flight ops surging right now. multiple fast movers up in the last few minutes',
          `caught it on the long lens: ${event.flightName}. that loadout is not a training fit`,
        ])
      }
      if (event.type === 'AIR_INTERCEPT') {
        if (event.kills > 0) {
          return pick(rng, [
            'contrails merging high over the water, then a fireball. aircraft down — air-to-air, has to be',
            'just watched something fall burning out of the sky offshore. multiple watchers confirm',
          ])
        }
        return 'fast jets merging high over the gulf, missile trails visible. everyone still flying as far as I can tell'
      }
      return null
    }

    case 'aggregator': {
      const garble = rng() < account.errorRate
      if (event.type === 'MISSILE_IMPACT') {
        const target = garble ? pick(rng, WRONG_NAMES) : nameOf(event.targetId, names)
        return pick(rng, [
          `BREAKING: impact reported at ${target} — awaiting visual confirmation`,
          `multiple sources reporting strikes on ${target}. developing`,
        ])
      }
      if (event.type === 'UNIT_DESTROYED') {
        const target = garble ? pick(rng, WRONG_NAMES) : nameOf(event.unitId, names)
        return pick(rng, [
          `CONFIRMED per two sources: ${target} destroyed`,
          `BREAKING: total loss reported at ${target}. unverified footage circulating`,
        ])
      }
      if (event.type === 'WAR_DECLARED') {
        const a = event.attacker.toUpperCase()
        const d = event.defender.toUpperCase()
        return pick(rng, [
          `BREAKING: ${a} DECLARES WAR ON ${d}`,
          `it's happening — state of war: ${a} vs ${d}. live coverage thread below`,
        ])
      }
      if (event.type === 'FLIGHT_LOST') {
        if (event.pilotFate === 'pow') {
          return pick(rng, [
            'reports of an aircraft down over the Gulf — state TV claims aircrew in custody. developing',
            `BREAKING: ${event.flightName} reported lost. unverified footage shows a parachute and a capture crowd`,
          ])
        }
        return pick(rng, [
          'reports of an aircraft down over the Gulf — SAR traffic spiking on open frequencies. developing',
          `multiple sources: ${event.flightName} failed to return. no official confirmation yet`,
        ])
      }
      return null
    }

    case 'webcam_watcher': {
      if (event.type === 'MINE_CONTACT') {
        return pick(rng, [
          'explosion low on the waterline mid-channel. vessel dead in the water on the south cam',
          `something just hit ${nameOf(event.targetId, names)} — smoke visible on the strait cam`,
        ])
      }
      if (event.type === 'SHIPPING_LANE_STATUS_CHANGE') {
        if (event.newStatus === 'blocked') {
          return pick(rng, [
            'strait cam: traffic has STOPPED. nothing moving in either direction',
            'zero hulls on the cam for an hour now. the lane is shut',
          ])
        }
        if (event.newStatus === 'reduced') {
          return pick(rng, [
            'counting maybe a third of normal transits on the cam today. insurers spooked?',
            'tankers holding at anchor outside the strait. traffic way down',
          ])
        }
        return pick(rng, [
          'cam shows convoys moving again. lane looks open',
          'normal transit picture restored on the strait cam',
        ])
      }
      return null
    }

    case 'regime_mouthpiece': {
      if (event.type === 'MISSILE_LAUNCHED' && IRAN_WEAPON_RE.test(event.weaponName)) {
        return pick(rng, [
          'Crushing response underway. Dozens of missiles en route to the aggressor. Victory is assured.',
          `The Guardians have unleashed ${event.weaponName}. The enemy will learn humility tonight.`,
          'Waves of fire answer every insult. The occupiers’ bases are burning.',
        ])
      }
      if (event.type === 'UNIT_DESTROYED' && IRAN_UNIT_RE.test(nameOf(event.unitId, names))) {
        return pick(rng, [
          `Enemy claims regarding ${nameOf(event.unitId, names)} are fabrication. All systems fully operational.`,
          `Western media recycles old footage about ${nameOf(event.unitId, names)}. Nothing was hit.`,
        ])
      }
      return null
    }

    case 'oil_analyst': {
      if (event.type === 'OIL_PRICE_CHANGE') {
        const up = event.newPrice > event.oldPrice
        const px = event.newPrice.toFixed(0)
        return pick(rng, [
          `Brent ${up ? 'up' : 'down'} to $${px}/bbl. Gulf risk premium ${up ? 'widening' : 'unwinding'}.`,
          `$${px} print. ${up ? 'War premium is real now' : 'Market shrugging off the Gulf'} — watching Hormuz transit counts.`,
        ])
      }
      if (event.type === 'SHIPPING_LANE_STATUS_CHANGE') {
        return pick(rng, [
          `Hormuz status: ${event.newStatus.toUpperCase()}. ~20% of seaborne crude rides on this strait.`,
          `Lane update — ${event.newStatus.toUpperCase()}. Charter rates will move before the wires do.`,
        ])
      }
      return null
    }

    case 'imagery_analyst': {
      if (event.type === 'MISSILE_IMPACT') {
        const target = nameOf(event.targetId, names)
        return pick(rng, [
          `new collect over ${target}: crater analysis suggests a deep-penetration hit, secondary scarring visible`,
          `BDA on ${target}: at least one aimpoint cratered, burn pattern consistent with fuel fire. full thread soon`,
        ])
      }
      return null
    }

    case 'leak_channel': {
      if (event.type === 'INTERCEPT_DECRYPTED' && event.precedence === 'FLASH') {
        return pick(rng, [
          `forwarded without comment: "${event.text}"`,
          `from a usually-reliable channel: "${event.text}"`,
        ])
      }
      return null
    }

    case 'joke_indicator': {
      if (event.type === 'WAR_SUPPORT_CRITICAL') {
        return pick(rng, [
          'pizza deliveries around a certain five-sided building up sharply tonight. draw your own conclusions',
          'late-night kebab orders near certain ministries: anomalous. the index never sleeps',
        ])
      }
      return null
    }
  }
}

/**
 * Pure core: posts an event generates across the whole account roster.
 * Deterministic for a fixed (event, names, currentTick) — safe to call repeatedly.
 * Each post's tick = event tick + the account's delay (never before currentTick).
 */
export function generatePostsForEvent(
  event: GameEvent,
  names: Map<string, string>,
  currentTick: number,
): OsintPost[] {
  const posts: OsintPost[] = []
  for (const account of OSINT_ACCOUNTS) {
    const rng = makeRng(hashString(`${event.tick}:${event.type}:${account.handle}`))
    const [min, max] = account.delayRangeSec
    const delay = min + Math.round(rng() * (max - min))
    const text = buildText(account, event, names, rng)
    if (!text) continue
    posts.push({
      id: `osint-${event.tick}-${event.type}-${account.handle}`,
      handle: account.handle,
      displayName: account.displayName,
      color: account.color,
      tick: Math.max(event.tick + delay, currentTick),
      text,
    })
  }
  return posts
}

// ── Feed store: pending posts drain into published as the game clock passes ─

interface OsintFeedStore {
  pending: OsintPost[]
  /** Newest first, capped at 100 */
  published: OsintPost[]
  lastBatch: GameEvent[] | null
  ingest: (events: GameEvent[], names: Map<string, string>, currentTick: number) => void
  advance: (currentTick: number) => void
}

export const useOsintFeedStore = create<OsintFeedStore>((set, get) => ({
  pending: [],
  published: [],
  lastBatch: null,

  ingest: (events, names, currentTick) => {
    // Event batches are one-shot from the worker; multiple hook consumers may
    // pass the same array — process each batch exactly once
    if (events.length === 0 || get().lastBatch === events) return
    const generated = events.flatMap((e) => generatePostsForEvent(e, names, currentTick))
    if (generated.length === 0) {
      set({ lastBatch: events })
      return
    }
    const pending = [...get().pending, ...generated]
    set({ lastBatch: events, pending })
    get().advance(currentTick)
  },

  advance: (currentTick) => {
    const { pending, published } = get()
    // Posts are only published once due — a published tick in the future means
    // the clock jumped backwards (new game / load): flush the feed
    if (published.length > 0 && published[0].tick > currentTick) {
      set({ pending: [], published: [], lastBatch: null })
      return
    }
    if (pending.length === 0) return
    const due = pending.filter((p) => p.tick <= currentTick)
    if (due.length === 0) return
    due.sort((a, b) => a.tick - b.tick)
    set({
      pending: pending.filter((p) => p.tick > currentTick),
      published: [...due.reverse(), ...published].slice(0, PUBLISHED_CAP),
    })
  },
}))

/** Published OSINT posts, newest first (max 100). */
export function useOsintFeed(): OsintPost[] {
  const events = useGameStore((s) => s.viewState.events)
  const tick = useGameStore((s) => s.viewState.time.tick)

  useEffect(() => {
    if (events.length === 0) return
    const { units, time } = useGameStore.getState().viewState
    const names = new Map(units.map((u) => [u.id, u.name] as const))
    useOsintFeedStore.getState().ingest(events, names, time.tick)
  }, [events])

  useEffect(() => {
    useOsintFeedStore.getState().advance(tick)
  }, [tick])

  return useOsintFeedStore((s) => s.published)
}
