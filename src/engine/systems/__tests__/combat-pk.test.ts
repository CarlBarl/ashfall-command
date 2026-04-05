import { describe, it, expect } from 'vitest'
import { speedModifier, altitudeModifier } from '../combat'

// ═══════════════════════════════════════════════
//  Speed Modifier Tests
// ═══════════════════════════════════════════════

describe('speedModifier', () => {
  it('gives max bonus (+12%) for very slow targets (SM-2 vs Shahed-136)', () => {
    // SM-2 at Mach 3.5 vs Shahed-136 at Mach 0.15 → ratio 23.3
    const mod = speedModifier(3.5, 0.15)
    expect(mod).toBeCloseTo(1.12, 2)
  })

  it('gives moderate bonus for slow targets (SM-2 vs Shahed-238)', () => {
    // SM-2 at Mach 3.5 vs Shahed-238 at Mach 0.43 → ratio 8.1
    const mod = speedModifier(3.5, 0.43)
    expect(mod).toBeGreaterThan(1.05)
    expect(mod).toBeLessThan(1.12)
  })

  it('gives small bonus for cruise missiles (SM-2 vs Tomahawk)', () => {
    // SM-2 at Mach 3.5 vs Tomahawk at Mach 0.75 → ratio 4.67
    const mod = speedModifier(3.5, 0.75)
    expect(mod).toBeGreaterThan(1.0)
    expect(mod).toBeLessThan(1.08)
  })

  it('penalizes when target is faster (SM-2 vs Shahab-3 terminal)', () => {
    // SM-2 at Mach 3.5 vs Shahab-3 at Mach 7.0 → ratio 0.5
    const mod = speedModifier(3.5, 7.0)
    expect(mod).toBeCloseTo(0.5, 2)
  })

  it('penalizes when target is slightly faster (PAC-3 vs Shahab-3)', () => {
    // PAC-3 at Mach 5.0 vs Shahab-3 at Mach 7.0 → ratio 0.714
    const mod = speedModifier(5.0, 7.0)
    expect(mod).toBeCloseTo(0.714, 2)
  })

  it('returns 1.0 when speeds are equal', () => {
    const mod = speedModifier(3.5, 3.5)
    expect(mod).toBeCloseTo(1.0, 2)
  })

  it('returns 1.0 for zero target speed', () => {
    const mod = speedModifier(3.5, 0)
    expect(mod).toBe(1.0)
  })

  it('returns 1.0 for negative target speed', () => {
    const mod = speedModifier(3.5, -1)
    expect(mod).toBe(1.0)
  })

  it('slow targets always easier than fast targets', () => {
    const vsShahed = speedModifier(3.5, 0.15)
    const vsTomahawk = speedModifier(3.5, 0.75)
    const vsShahab = speedModifier(3.5, 7.0)
    expect(vsShahed).toBeGreaterThan(vsTomahawk)
    expect(vsTomahawk).toBeGreaterThan(vsShahab)
  })
})

// ═══════════════════════════════════════════════
//  Altitude Modifier Tests
// ═══════════════════════════════════════════════

describe('altitudeModifier', () => {
  it('maximum penalty for sea-skimmers (Harpoon at 15ft)', () => {
    const mod = altitudeModifier(15)
    expect(mod).toBe(0.75)
  })

  it('maximum penalty for terrain-followers (Tomahawk at 100ft)', () => {
    const mod = altitudeModifier(100)
    expect(mod).toBe(0.75)
  })

  it('interpolates between 100-500ft (Soumar at 150ft)', () => {
    const mod = altitudeModifier(150)
    expect(mod).toBeGreaterThan(0.75)
    expect(mod).toBeLessThan(1.0)
  })

  it('no penalty at 500ft (Shahed-136)', () => {
    const mod = altitudeModifier(500)
    expect(mod).toBeCloseTo(1.0, 2)
  })

  it('no penalty at 1000ft (Shahed-238)', () => {
    const mod = altitudeModifier(1000)
    expect(mod).toBe(1.0)
  })

  it('no penalty at high altitude', () => {
    const mod = altitudeModifier(30000)
    expect(mod).toBe(1.0)
  })

  it('higher altitude is always easier than lower', () => {
    const at15 = altitudeModifier(15)
    const at100 = altitudeModifier(100)
    const at300 = altitudeModifier(300)
    const at500 = altitudeModifier(500)
    expect(at15).toBeLessThanOrEqual(at100)
    expect(at100).toBeLessThanOrEqual(at300)
    expect(at300).toBeLessThanOrEqual(at500)
  })

  // Ballistic missile phase penalties
  it('ballistic terminal phase penalty', () => {
    const mod = altitudeModifier(100000, 'ballistic_missile', 'terminal')
    expect(mod).toBeCloseTo(0.75, 2)
  })

  it('ballistic midcourse phase penalty', () => {
    const mod = altitudeModifier(200000, 'ballistic_missile', 'midcourse')
    expect(mod).toBeCloseTo(0.85, 2)
  })

  it('ballistic boost phase penalty', () => {
    const mod = altitudeModifier(50000, 'ballistic_missile', 'boost')
    expect(mod).toBeCloseTo(0.70, 2)
  })

  it('ballistic cruise phase no penalty', () => {
    const mod = altitudeModifier(50000, 'ballistic_missile', 'cruise')
    expect(mod).toBe(1.0)
  })
})
