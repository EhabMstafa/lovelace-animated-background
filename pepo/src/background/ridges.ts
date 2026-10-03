import { mulberry32 } from '../presence/orb/geometry'

/**
 * Procedural mountain ridgeline: heights (0..1) at `samples` points across.
 * Ridged noise gives sharp crests; the centre stays low so the Orb has an
 * open valley to float over, the flanks rise into peaks.
 */
export function ridge(seed: number, samples: number, roughness: number, valley = 1.4) {
  const rand = mulberry32(seed)
  const octaves = [
    { f: 2.3, a: 1, p: rand() * 10 },
    { f: 5.1, a: 0.5, p: rand() * 10 },
    { f: 11.7, a: 0.22 * roughness, p: rand() * 10 },
    { f: 27.0, a: 0.09 * roughness, p: rand() * 10 },
    { f: 61.0, a: 0.035 * roughness, p: rand() * 10 },
  ]
  const out = new Float32Array(samples + 1)
  for (let i = 0; i <= samples; i++) {
    const x = i / samples
    let n = 0
    for (const o of octaves) n += Math.pow(1 - Math.abs(Math.sin(x * o.f * Math.PI + o.p)), 1.7) * o.a
    const flank = Math.pow(Math.abs(x - 0.5) * 2, valley)
    out[i] = (0.08 + 0.92 * flank) * Math.min(1, n / 1.25)
  }
  return out
}
