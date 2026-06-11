import { describe, it, expect, vi } from 'vitest'
import {
  AudioManager,
  AUDIO_STORAGE_KEYS,
  DEFAULT_DEBOUNCE_MS,
  DEFAULT_VOLUME,
  SOUND_DEBOUNCE_MS,
} from '../audio-manager'
import type { AudioManagerDeps, SoundKit, SoundName } from '../audio-manager'

const SOUND_NAMES: SoundName[] = [
  'klaxon', 'sonar-ping', 'radio-squelch', 'launch-whoosh',
  'distant-impact', 'ui-blip', 'ui-error', 'ambient-cic',
]

function makeFakeGain() {
  return {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
}

function makeFakeSource() {
  return {
    buffer: null as unknown,
    loop: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }
}

function makeFakeContext() {
  const gains: ReturnType<typeof makeFakeGain>[] = []
  const sources: ReturnType<typeof makeFakeSource>[] = []
  const ctx = {
    state: 'suspended',
    sampleRate: 44100,
    destination: {},
    resume: vi.fn(async () => { ctx.state = 'running' }),
    createGain: vi.fn(() => {
      const g = makeFakeGain()
      gains.push(g)
      return g
    }),
    createBufferSource: vi.fn(() => {
      const s = makeFakeSource()
      sources.push(s)
      return s
    }),
  }
  return { ctx, gains, sources }
}

function makeMapStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
  }
}

function makeKit(): SoundKit {
  const kit: SoundKit = {}
  for (const name of SOUND_NAMES) kit[name] = { soundName: name } as unknown as AudioBuffer
  return kit
}

function makeManager(over: Partial<AudioManagerDeps> = {}) {
  const fake = makeFakeContext()
  const storage = makeMapStorage()
  const clock = { nowMs: 0 }
  const manager = new AudioManager({
    createContext: () => fake.ctx as unknown as AudioContext,
    loadKit: async () => makeKit(),
    storage,
    now: () => clock.nowMs,
    ...over,
  })
  return { manager, fake, storage, clock }
}

describe('AudioManager init', () => {
  it('resumes a suspended context and builds master/sfx/ambient buses', async () => {
    const { manager, fake } = makeManager()
    await manager.init()
    expect(fake.ctx.resume).toHaveBeenCalledTimes(1)
    expect(fake.ctx.createGain).toHaveBeenCalledTimes(3)
    expect(manager.isInitialized()).toBe(true)
  })

  it('initializes once on the first gesture, then ignores further gestures', async () => {
    const { manager, fake } = makeManager()
    const target = new EventTarget()
    manager.attachGestureListeners(target)
    expect(manager.isInitialized()).toBe(false)

    target.dispatchEvent(new Event('pointerdown'))
    await manager.init()
    expect(fake.ctx.resume).toHaveBeenCalledTimes(1)

    target.dispatchEvent(new Event('keydown'))
    target.dispatchEvent(new Event('pointerdown'))
    await manager.init()
    expect(fake.ctx.createGain).toHaveBeenCalledTimes(3)
  })

  it('degrades gracefully when no AudioContext is available', async () => {
    const { manager } = makeManager({ createContext: () => null })
    await manager.init()
    expect(manager.isInitialized()).toBe(false)
    expect(manager.play('ui-blip')).toBe(false)
    expect(() => manager.startAmbient()).not.toThrow()
    expect(() => manager.stopAmbient()).not.toThrow()
  })
})

describe('AudioManager play + debounce', () => {
  it('does not play before init, and the failed attempt does not burn the debounce window', async () => {
    const { manager, fake } = makeManager()
    expect(manager.play('ui-blip')).toBe(false)
    expect(fake.sources.length).toBe(0)
    await manager.init()
    expect(manager.play('ui-blip')).toBe(true)
    expect(fake.sources.length).toBe(1)
    expect(fake.sources[0].start).toHaveBeenCalledTimes(1)
  })

  it('debounces repeats inside the default window and allows them after', async () => {
    const { manager, clock } = makeManager()
    await manager.init()
    expect(manager.play('ui-blip')).toBe(true)
    expect(manager.play('ui-blip')).toBe(false)
    clock.nowMs = DEFAULT_DEBOUNCE_MS - 1
    expect(manager.play('ui-blip')).toBe(false)
    clock.nowMs = DEFAULT_DEBOUNCE_MS
    expect(manager.play('ui-blip')).toBe(true)
  })

  it('debounces klaxon with its heavy per-sound window', async () => {
    const { manager, clock } = makeManager()
    await manager.init()
    const gap = SOUND_DEBOUNCE_MS['klaxon']!
    expect(manager.play('klaxon')).toBe(true)
    clock.nowMs = gap - 1
    expect(manager.play('klaxon')).toBe(false)
    clock.nowMs = gap
    expect(manager.play('klaxon')).toBe(true)
  })

  it('tracks debounce per sound name, not globally', async () => {
    const { manager, fake } = makeManager()
    await manager.init()
    expect(manager.play('ui-blip')).toBe(true)
    expect(manager.play('klaxon')).toBe(true)
    expect(fake.sources.length).toBe(2)
  })

  it('applies per-play volume through an extra gain node', async () => {
    const { manager, fake } = makeManager()
    await manager.init()
    expect(manager.play('ui-blip', { volume: 0.3 })).toBe(true)
    const perPlayGain = fake.gains[3] // 0-2 are master/sfx/ambient
    expect(perPlayGain.gain.value).toBe(0.3)
    expect(fake.sources[0].connect).toHaveBeenCalledWith(perPlayGain)
  })

  it('returns false for sounds missing from the kit', async () => {
    const { manager } = makeManager({ loadKit: async () => ({}) })
    await manager.init()
    expect(manager.play('ui-blip')).toBe(false)
  })
})

describe('AudioManager mute/volume persistence', () => {
  it('defaults to unmuted at default volume', () => {
    const { manager } = makeManager()
    expect(manager.isMuted()).toBe(false)
    expect(manager.getVolume()).toBe(DEFAULT_VOLUME)
  })

  it('drives the master gain: volume when unmuted, 0 when muted', async () => {
    const { manager, fake } = makeManager()
    await manager.init()
    const master = fake.gains[0]
    expect(master.gain.value).toBe(DEFAULT_VOLUME)

    manager.setMuted(true)
    expect(master.gain.value).toBe(0)

    manager.setVolume(0.8)
    expect(master.gain.value).toBe(0)

    manager.setMuted(false)
    expect(master.gain.value).toBe(0.8)
  })

  it('persists prefs and restores them in a fresh manager', () => {
    const { manager, storage } = makeManager()
    manager.setMuted(true)
    manager.setVolume(0.8)
    expect(storage.map.get(AUDIO_STORAGE_KEYS.muted)).toBe('1')
    expect(storage.map.get(AUDIO_STORAGE_KEYS.volume)).toBe('0.8')

    const { manager: restored } = makeManager({ storage })
    expect(restored.isMuted()).toBe(true)
    expect(restored.getVolume()).toBe(0.8)
  })

  it('clamps volume to 0..1', () => {
    const { manager } = makeManager()
    manager.setVolume(1.7)
    expect(manager.getVolume()).toBe(1)
    manager.setVolume(-2)
    expect(manager.getVolume()).toBe(0)
  })

  it('works without storage', () => {
    const { manager } = makeManager({ storage: null })
    expect(() => manager.setMuted(true)).not.toThrow()
    expect(manager.isMuted()).toBe(true)
  })
})

describe('AudioManager ambient loop', () => {
  it('starts the loop after init even when requested before, and stops cleanly', async () => {
    const { manager, fake } = makeManager()
    manager.startAmbient()
    expect(fake.sources.length).toBe(0)

    await manager.init()
    expect(fake.sources.length).toBe(1)
    expect(fake.sources[0].loop).toBe(true)
    expect(fake.sources[0].start).toHaveBeenCalledTimes(1)

    manager.startAmbient()
    expect(fake.sources.length).toBe(1)

    manager.stopAmbient()
    expect(fake.sources[0].stop).toHaveBeenCalledTimes(1)

    manager.startAmbient()
    expect(fake.sources.length).toBe(2)
  })

  it('does not start ambient when the kit lacks the loop buffer', async () => {
    const { manager, fake } = makeManager({ loadKit: async () => ({}) })
    await manager.init()
    manager.startAmbient()
    expect(fake.sources.length).toBe(0)
  })
})
