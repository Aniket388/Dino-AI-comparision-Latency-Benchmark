/**
 * Deterministic pseudo-random number generator (Mulberry32)
 * Ensures 100% reproducible obstacle sequences across both Dino engines and multi-trial runs.
 */
export class SeededPRNG {
  private state: number;

  constructor(seed: number = 1337) {
    this.state = seed ? (seed >>> 0) : 1337;
  }

  // Returns float [0, 1)
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Returns integer in range [min, max]
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  // Pick random element from array
  pick<T>(items: T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  reset(newSeed?: number) {
    if (newSeed !== undefined) {
      this.state = newSeed >>> 0;
    }
  }
}
