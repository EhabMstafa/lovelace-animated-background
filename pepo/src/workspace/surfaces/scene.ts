import { ridge } from '../../background/ridges'

export type SceneMood = 'dawn' | 'day' | 'dusk' | 'night'

const MOODS: Record<SceneMood, { sky: [string, string]; far: string; near: string; water: [string, string]; sun: string | null }> = {
  dawn: { sky: ['#9fb6dc', '#f3d7c4'], far: '#8a9cc0', near: '#5d6f96', water: ['#a9bad6', '#dfe6f1'], sun: 'rgba(255,214,170,0.9)' },
  day: { sky: ['#6fa4dc', '#cfe3f3'], far: '#6f8fb4', near: '#3f5f80', water: ['#5b86b0', '#a8c5df'], sun: 'rgba(255,250,235,0.9)' },
  dusk: { sky: ['#1d2a5c', '#e59a7a'], far: '#3a3f6e', near: '#1e2346', water: ['#2a3060', '#7a6a8a'], sun: 'rgba(255,170,120,0.85)' },
  night: { sky: ['#030812', '#16244a'], far: '#1c2b55', near: '#0b1430', water: ['#0d1834', '#03070f'], sun: null },
}

/**
 * A small painted landscape (fjord, ridges, water) used as image thumbnails
 * and as the video frame. Painted, not loaded: the prototype has no media
 * files. `pan` (0..1) slides the view for the video.
 */
export function paintScene(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, mood: SceneMood, pan = 0) {
  const m = MOODS[mood]
  const hy = h * 0.62
  const sky = ctx.createLinearGradient(0, 0, 0, hy)
  sky.addColorStop(0, m.sky[0])
  sky.addColorStop(1, m.sky[1])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, hy)
  if (m.sun) {
    const sx = w * (0.68 - pan * 0.25)
    const g = ctx.createRadialGradient(sx, hy * 0.72, 0, sx, hy * 0.72, h * 0.32)
    g.addColorStop(0, m.sun)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, hy)
  } else {
    for (let i = 0; i < 40; i++) {
      const x = ((Math.sin(seed * 13.1 + i * 7.7) + 1) / 2) * w
      const y = ((Math.sin(seed * 3.3 + i * 4.1) + 1) / 2) * hy * 0.8
      ctx.fillStyle = `rgba(210,225,255,${0.25 + 0.4 * ((i * 37) % 10) / 10})`
      ctx.fillRect(x, y, 1, 1)
    }
  }
  const layers = [
    { s: seed, hgt: h * 0.26, color: m.far, speed: 0.25 },
    { s: seed + 5, hgt: h * 0.36, color: m.near, speed: 0.6 },
  ]
  const n = 120
  for (const L of layers) {
    const r = ridge(L.s, n * 2, 1, 1.1)
    const off = Math.floor(pan * L.speed * n)
    ctx.beginPath()
    ctx.moveTo(0, hy)
    for (let i = 0; i <= n; i++) ctx.lineTo((i / n) * w, hy - r[i + off] * L.hgt)
    ctx.lineTo(w, hy)
    ctx.closePath()
    ctx.fillStyle = L.color
    ctx.fill()
  }
  const water = ctx.createLinearGradient(0, hy, 0, h)
  water.addColorStop(0, m.water[0])
  water.addColorStop(1, m.water[1])
  ctx.fillStyle = water
  ctx.fillRect(0, hy, w, h - hy)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  for (let i = 0; i < 14; i++) ctx.fillRect(((i * 53 + seed * 17) % 100) / 100 * w, hy + ((i * 29) % 100) / 100 * (h - hy), 12 + (i % 4) * 10, 1)
}
