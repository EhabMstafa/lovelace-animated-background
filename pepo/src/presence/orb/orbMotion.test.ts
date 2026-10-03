import { describe, expect, it } from 'vitest'
import { mulberry32 } from './geometry'
import { createOrbMotion } from './orbMotion'

const dt = 1 / 60

describe('orb motion', () => {
  it('breathes in cycles of 4–7 s that are never identical', () => {
    const m = createOrbMotion(mulberry32(3))
    const peaks: number[] = []
    let a = 0, b = 0
    for (let i = 0, t = 0; i < 120 * 60; i++, t += dt) {
      const v = m.step(dt, 'idle', 0).breath
      if (b > a && b > v && b > 0) peaks.push(t)
      a = b
      b = v
    }
    // Skip the first, partial cycle.
    const gaps = peaks.slice(2).map((t, i) => t - peaks[i + 1])
    expect(gaps.length).toBeGreaterThan(10)
    for (const g of gaps) expect(g).toBeGreaterThan(3.6)
    for (const g of gaps) expect(g).toBeLessThan(7.4)
    expect(new Set(gaps.map((g) => g.toFixed(1))).size).toBeGreaterThan(4)
  })

  it('ignores microphone noise and follows phrases, not syllables', () => {
    const m = createOrbMotion(mulberry32(4))
    let maxNoise = 0
    for (let i = 0; i < 120; i++) maxNoise = Math.max(maxNoise, m.step(dt, 'listening', 0.05 * Math.random()).listen)
    expect(maxNoise).toBe(0)
    // Syllables at ~5 Hz inside a phrase: the envelope stays steady.
    const values: number[] = []
    for (let i = 0, t = 0; i < 240; i++, t += dt) {
      const v = m.step(dt, 'listening', 0.5 + 0.4 * Math.sin(t * Math.PI * 2 * 5)).listen
      if (t > 2) values.push(v)
    }
    const swing = Math.max(...values) - Math.min(...values)
    expect(swing).toBeLessThan(0.25)
  })

  it('only reacts to the voice in the matching state', () => {
    const m = createOrbMotion(mulberry32(5))
    let s
    for (let i = 0; i < 120; i++) s = m.step(dt, 'thinking', 0.9)
    expect(s!.listen).toBe(0)
    expect(s!.speak).toBe(0)
  })
})
