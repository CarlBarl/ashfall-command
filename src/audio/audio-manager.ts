import { synthesizeKit } from './synth'

export type SoundName =
  | 'klaxon'
  | 'sonar-ping'
  | 'radio-squelch'
  | 'launch-whoosh'
  | 'distant-impact'
  | 'ui-blip'
  | 'ui-error'
  | 'ambient-cic'

export type BusName = 'sfx' | 'ambient'

export interface PlayOptions {
  bus?: BusName
  volume?: number
}

export const AUDIO_STORAGE_KEYS = {
  muted: 'ashfall.audio.muted',
  volume: 'ashfall.audio.volume',
} as const

export const DEFAULT_VOLUME = 0.5
/** Ambient bus sits well under sfx — CIC room tone, not a soundtrack */
const AMBIENT_BUS_LEVEL = 0.4

export const DEFAULT_DEBOUNCE_MS = 80
/** Long sounds get long debounces so a 30-missile salvo doesn't stack 30 klaxons */
export const SOUND_DEBOUNCE_MS: Partial<Record<SoundName, number>> = {
  'klaxon': 2500,
  'launch-whoosh': 1500,
  'distant-impact': 300,
  'sonar-ping': 500,
  'radio-squelch': 400,
  'ui-error': 200,
}

export type SoundKit = Partial<Record<SoundName, AudioBuffer>>

export interface AudioManagerDeps {
  createContext?: () => AudioContext | null
  loadKit?: (ctx: AudioContext) => Promise<SoundKit>
  /** null = no persistence (e.g. storage blocked) */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null
  now?: () => number
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function defaultCreateContext(): AudioContext | null {
  try {
    const Ctor = typeof AudioContext !== 'undefined'
      ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    return Ctor ? new Ctor() : null
  } catch {
    return null
  }
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

export class AudioManager {
  private createContext: () => AudioContext | null
  private loadKit: (ctx: AudioContext) => Promise<SoundKit>
  private storage: Pick<Storage, 'getItem' | 'setItem'> | null
  private now: () => number

  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private buses: Record<BusName, GainNode> | null = null
  private buffers: SoundKit = {}
  private lastPlayedMs = new Map<SoundName, number>()
  private ambientSource: AudioBufferSourceNode | null = null
  private ambientWanted = false
  private muted: boolean
  private volume: number
  private initPromise: Promise<void> | null = null
  private detachGesture: (() => void) | null = null

  constructor(deps: AudioManagerDeps = {}) {
    this.createContext = deps.createContext ?? defaultCreateContext
    this.loadKit = deps.loadKit ?? ((ctx) => synthesizeKit(ctx.sampleRate))
    this.storage = deps.storage === undefined ? defaultStorage() : deps.storage
    this.now = deps.now
      ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))

    this.muted = this.readStored(AUDIO_STORAGE_KEYS.muted) === '1'
    const storedVolume = this.readStored(AUDIO_STORAGE_KEYS.volume)
    const parsed = storedVolume === null ? NaN : Number(storedVolume)
    this.volume = Number.isFinite(parsed) ? clamp01(parsed) : DEFAULT_VOLUME
  }

  /** Browsers block AudioContext until a user gesture — init on the first one, then detach */
  attachGestureListeners(target: EventTarget): void {
    if (this.detachGesture) return
    const onGesture = () => {
      this.detachGesture?.()
      void this.init()
    }
    target.addEventListener('pointerdown', onGesture, { once: true })
    target.addEventListener('keydown', onGesture, { once: true })
    this.detachGesture = () => {
      target.removeEventListener('pointerdown', onGesture)
      target.removeEventListener('keydown', onGesture)
      this.detachGesture = null
    }
  }

  detachGestureListeners(): void {
    this.detachGesture?.()
  }

  /** Idempotent; a failed init leaves the manager permanently (and silently) inert */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch(() => undefined)
    }
    return this.initPromise
  }

  isInitialized(): boolean {
    return this.ctx !== null
  }

  private async doInit(): Promise<void> {
    const ctx = this.createContext()
    if (!ctx) return
    this.ctx = ctx
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        // stays suspended — play() calls are harmless no-audio ops
      }
    }

    const master = ctx.createGain()
    master.connect(ctx.destination)
    const sfx = ctx.createGain()
    sfx.connect(master)
    const ambient = ctx.createGain()
    ambient.gain.value = AMBIENT_BUS_LEVEL
    ambient.connect(master)
    this.master = master
    this.buses = { sfx, ambient }
    this.applyMasterGain()

    try {
      this.buffers = await this.loadKit(ctx)
    } catch {
      this.buffers = {}
    }
    if (this.ambientWanted) this.startAmbientSource()
  }

  /** Returns true only when a source actually started */
  play(name: SoundName, opts: PlayOptions = {}): boolean {
    const minGapMs = SOUND_DEBOUNCE_MS[name] ?? DEFAULT_DEBOUNCE_MS
    const t = this.now()
    const last = this.lastPlayedMs.get(name)
    if (last !== undefined && t - last < minGapMs) return false

    const ctx = this.ctx
    const buses = this.buses
    const buffer = this.buffers[name]
    if (!ctx || !buses || !buffer) return false

    this.lastPlayedMs.set(name, t)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const bus = buses[opts.bus ?? 'sfx']
    if (opts.volume !== undefined) {
      const gain = ctx.createGain()
      gain.gain.value = clamp01(opts.volume)
      source.connect(gain)
      gain.connect(bus)
    } else {
      source.connect(bus)
    }
    source.start()
    return true
  }

  startAmbient(): void {
    this.ambientWanted = true
    this.startAmbientSource()
  }

  stopAmbient(): void {
    this.ambientWanted = false
    if (!this.ambientSource) return
    try {
      this.ambientSource.stop()
    } catch {
      // already stopped
    }
    try {
      this.ambientSource.disconnect()
    } catch {
      // already disconnected
    }
    this.ambientSource = null
  }

  private startAmbientSource(): void {
    if (!this.ambientWanted || this.ambientSource) return
    const ctx = this.ctx
    const buses = this.buses
    const buffer = this.buffers['ambient-cic']
    if (!ctx || !buses || !buffer) return
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(buses.ambient)
    source.start()
    this.ambientSource = source
  }

  isMuted(): boolean {
    return this.muted
  }

  getVolume(): number {
    return this.volume
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.writeStored(AUDIO_STORAGE_KEYS.muted, muted ? '1' : '0')
    this.applyMasterGain()
  }

  setVolume(volume: number): void {
    this.volume = clamp01(volume)
    this.writeStored(AUDIO_STORAGE_KEYS.volume, String(this.volume))
    this.applyMasterGain()
  }

  private applyMasterGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume
  }

  private readStored(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null
    } catch {
      return null
    }
  }

  private writeStored(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value)
    } catch {
      // persistence unavailable — session-only prefs
    }
  }
}

export const audioManager = new AudioManager()
