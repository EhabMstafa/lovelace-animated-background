import { mulberry32 } from '../presence/orb/geometry'

/**
 * Procedural mountain ridgelines in a 1600×400 viewBox, generated once.
 * Peaks rise towards the sides so the centre stays open for the Orb.
 */
export function ridgePath(seed: number, baseY: number, height: number, roughness: number) {
  const rand = mulberry32(seed)
  const W = 1600
  const N = 160
  const octaves = [
    { f: 2.1, a: 1, p: rand() * 10 },
    { f: 5.3, a: 0.45, p: rand() * 10 },
    { f: 13.7, a: 0.18 * roughness, p: rand() * 10 },
    { f: 31.0, a: 0.07 * roughness, p: rand() * 10 },
  ]
  const pts: string[] = []
  for (let i = 0; i <= N; i++) {
    const x = i / N
    let n = 0
    // Ridged noise: sharp crests, soft valleys.
    for (const o of octaves) n += Math.pow(1 - Math.abs(Math.sin(x * o.f * Math.PI + o.p)), 1.6) * o.a
    // Valley in the middle, mountains at the flanks.
    const flank = Math.pow(Math.abs(x - 0.5) * 2, 1.4)
    const y = baseY - (0.1 + 0.9 * flank) * height * Math.min(1, n / 1.3)
    pts.push(`${(x * W).toFixed(1)},${y.toFixed(1)}`)
  }
  return `M0,400 L${pts.join(' L')} L${W},400 Z`
}

export const FAR_RIDGE = ridgePath(3, 400, 250, 0.8)
export const NEAR_RIDGE = ridgePath(9, 400, 330, 1)
