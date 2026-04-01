/** Seeded PRNG (mulberry32) for deterministic replay */
export class SeededRNG {
  private state: number

  constructor(seed: number) {
    this.state = seed
  }

  /** Returns a number in [0, 1) */
  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Returns true with probability p */
  chance(p: number): boolean {
    return this.next() < p
  }

  /** Returns integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }
}
