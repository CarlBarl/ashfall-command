import type { SoundKit } from './audio-manager'

// Procedural DEFCON-style ops-room kit — no audio assets shipped, every sound is
// rendered once at init via OfflineAudioContext and cached as an AudioBuffer.

const DEFAULT_SAMPLE_RATE = 44100

type OfflineCtor = new (numberOfChannels: number, length: number, sampleRate: number) => OfflineAudioContext

function getOfflineCtor(): OfflineCtor | null {
  if (typeof OfflineAudioContext !== 'undefined') return OfflineAudioContext
  const webkit = (globalThis as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext
  return webkit ?? null
}

function whiteNoiseBuffer(ctx: OfflineAudioContext, seconds: number): AudioBuffer {
  const n = Math.ceil(seconds * ctx.sampleRate)
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function noiseSource(ctx: OfflineAudioContext, seconds: number): AudioBufferSourceNode {
  const source = ctx.createBufferSource()
  source.buffer = whiteNoiseBuffer(ctx, seconds)
  return source
}

type Builder = (ctx: OfflineAudioContext, master: GainNode) => void

async function render(Offline: OfflineCtor, sampleRate: number, seconds: number, build: Builder): Promise<AudioBuffer> {
  const ctx = new Offline(1, Math.ceil(seconds * sampleRate), sampleRate)
  const master = ctx.createGain()
  master.connect(ctx.destination)
  build(ctx, master)
  return ctx.startRendering()
}

/** Short scope blip — track updates, intercepts, PD kills */
function buildUiBlip(ctx: OfflineAudioContext, master: GainNode): void {
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.value = 1240
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, 0)
  gain.gain.linearRampToValueAtTime(0.5, 0.005)
  gain.gain.exponentialRampToValueAtTime(0.001, 0.08)
  osc.connect(gain)
  gain.connect(master)
  osc.start(0)
  osc.stop(0.09)
}

/** Two falling buzzer notes — denied / source lost */
function buildUiError(ctx: OfflineAudioContext, master: GainNode): void {
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1200
  lp.connect(master)
  const note = (freq: number, start: number, dur: number) => {
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = freq
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.3, start + 0.008)
    gain.gain.setValueAtTime(0.3, start + dur - 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur)
    osc.connect(gain)
    gain.connect(lp)
    osc.start(start)
    osc.stop(start + dur)
  }
  note(440, 0, 0.1)
  note(294, 0.11, 0.13)
}

/** Two-tone alternating klaxon — war declared, own unit lost */
function buildKlaxon(ctx: OfflineAudioContext, master: GainNode): void {
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 1500
  const gain = ctx.createGain()
  for (let i = 0; i < 6; i++) {
    osc.frequency.setValueAtTime(i % 2 === 0 ? 620 : 466, i * 0.3)
  }
  gain.gain.setValueAtTime(0, 0)
  gain.gain.linearRampToValueAtTime(0.4, 0.015)
  gain.gain.setValueAtTime(0.4, 1.5)
  gain.gain.exponentialRampToValueAtTime(0.001, 1.78)
  osc.connect(lp)
  lp.connect(gain)
  gain.connect(master)
  osc.start(0)
  osc.stop(1.8)
}

/** Sine ping with long decay and one faint echo — satellite pass complete */
function buildSonarPing(ctx: OfflineAudioContext, master: GainNode): void {
  const ping = (start: number, level: number) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1050, start)
    osc.frequency.exponentialRampToValueAtTime(980, start + 0.9)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(level, start + 0.006)
    gain.gain.exponentialRampToValueAtTime(0.0005, start + 1.0)
    osc.connect(gain)
    gain.connect(master)
    osc.start(start)
    osc.stop(start + 1.0)
  }
  ping(0, 0.55)
  ping(0.35, 0.16)
}

/** Bandpassed static burst ending in a click — comms traffic */
function buildRadioSquelch(ctx: OfflineAudioContext, master: GainNode): void {
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1800
  bp.Q.value = 0.8
  bp.connect(master)
  const burst = (start: number, dur: number, level: number) => {
    const src = noiseSource(ctx, dur)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(level, start + 0.01)
    gain.gain.setValueAtTime(level, start + dur - 0.015)
    gain.gain.linearRampToValueAtTime(0, start + dur)
    src.connect(gain)
    gain.connect(bp)
    src.start(start)
    src.stop(start + dur)
  }
  burst(0, 0.18, 0.4)
  burst(0.22, 0.06, 0.25)
}

/** Filtered-noise sweep with a sub-bass rumble — missile away */
function buildLaunchWhoosh(ctx: OfflineAudioContext, master: GainNode): void {
  const src = noiseSource(ctx, 1.6)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(150, 0)
  lp.frequency.exponentialRampToValueAtTime(2800, 0.5)
  lp.frequency.exponentialRampToValueAtTime(500, 1.55)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, 0)
  gain.gain.linearRampToValueAtTime(0.5, 0.4)
  gain.gain.exponentialRampToValueAtTime(0.002, 1.55)
  src.connect(lp)
  lp.connect(gain)
  gain.connect(master)
  src.start(0)
  src.stop(1.6)

  const sub = ctx.createOscillator()
  sub.type = 'sawtooth'
  sub.frequency.setValueAtTime(60, 0)
  sub.frequency.exponentialRampToValueAtTime(28, 1.4)
  const subGain = ctx.createGain()
  subGain.gain.setValueAtTime(0, 0)
  subGain.gain.linearRampToValueAtTime(0.15, 0.3)
  subGain.gain.exponentialRampToValueAtTime(0.001, 1.5)
  sub.connect(subGain)
  subGain.connect(master)
  sub.start(0)
  sub.stop(1.6)
}

/** Muffled low thud — impacts and unit losses heard from the CIC, not the front line */
function buildDistantImpact(ctx: OfflineAudioContext, master: GainNode): void {
  const thump = ctx.createOscillator()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(90, 0)
  thump.frequency.exponentialRampToValueAtTime(38, 0.5)
  const thumpGain = ctx.createGain()
  thumpGain.gain.setValueAtTime(0, 0)
  thumpGain.gain.linearRampToValueAtTime(0.7, 0.012)
  thumpGain.gain.exponentialRampToValueAtTime(0.001, 1.0)
  thump.connect(thumpGain)
  thumpGain.connect(master)
  thump.start(0)
  thump.stop(1.05)

  const debris = noiseSource(ctx, 0.35)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 400
  const debrisGain = ctx.createGain()
  debrisGain.gain.setValueAtTime(0, 0)
  debrisGain.gain.linearRampToValueAtTime(0.35, 0.01)
  debrisGain.gain.exponentialRampToValueAtTime(0.001, 0.32)
  debris.connect(lp)
  lp.connect(debrisGain)
  debrisGain.connect(master)
  debris.start(0)
  debris.stop(0.35)
}

const AMBIENT_LOOP_S = 8
const AMBIENT_FADE_S = 0.4

/** Very quiet CIC room tone: mains hum + air handling, rendered loop-seamless */
async function renderAmbient(Offline: OfflineCtor, sampleRate: number): Promise<AudioBuffer> {
  const totalS = AMBIENT_LOOP_S + AMBIENT_FADE_S
  const ctx = new Offline(1, Math.ceil(totalS * sampleRate), sampleRate)
  const master = ctx.createGain()
  master.connect(ctx.destination)

  const hum = (freq: number, level: number) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const gain = ctx.createGain()
    gain.gain.value = level
    osc.connect(gain)
    gain.connect(master)
    osc.start(0)
    osc.stop(totalS)
  }
  hum(60, 0.05)
  hum(120, 0.028)

  const air = noiseSource(ctx, totalS)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 450
  const airGain = ctx.createGain()
  airGain.gain.value = 0.06
  air.connect(lp)
  lp.connect(airGain)
  airGain.connect(master)
  air.start(0)
  air.stop(totalS)

  const rendered = await ctx.startRendering()

  // Crossfade the extra tail into the head, then trim — plain loop=true plays seamlessly
  const loopN = Math.floor(AMBIENT_LOOP_S * sampleRate)
  const fadeN = Math.floor(AMBIENT_FADE_S * sampleRate)
  const src = rendered.getChannelData(0)
  const out = ctx.createBuffer(1, loopN, sampleRate)
  const dst = out.getChannelData(0)
  dst.set(src.subarray(0, loopN))
  for (let i = 0; i < fadeN; i++) {
    const w = i / fadeN
    dst[i] = dst[i] * w + src[loopN + i] * (1 - w)
  }
  return out
}

export async function synthesizeKit(sampleRate?: number): Promise<SoundKit> {
  const Offline = getOfflineCtor()
  if (!Offline) return {}
  const sr = sampleRate !== undefined && Number.isFinite(sampleRate) && sampleRate >= 8000
    ? sampleRate
    : DEFAULT_SAMPLE_RATE

  try {
    const [klaxon, sonarPing, radioSquelch, launchWhoosh, distantImpact, uiBlip, uiError, ambientCic]
      = await Promise.all([
        render(Offline, sr, 1.8, buildKlaxon),
        render(Offline, sr, 1.4, buildSonarPing),
        render(Offline, sr, 0.32, buildRadioSquelch),
        render(Offline, sr, 1.6, buildLaunchWhoosh),
        render(Offline, sr, 1.1, buildDistantImpact),
        render(Offline, sr, 0.09, buildUiBlip),
        render(Offline, sr, 0.26, buildUiError),
        renderAmbient(Offline, sr),
      ])
    return {
      'klaxon': klaxon,
      'sonar-ping': sonarPing,
      'radio-squelch': radioSquelch,
      'launch-whoosh': launchWhoosh,
      'distant-impact': distantImpact,
      'ui-blip': uiBlip,
      'ui-error': uiError,
      'ambient-cic': ambientCic,
    }
  } catch {
    return {}
  }
}
