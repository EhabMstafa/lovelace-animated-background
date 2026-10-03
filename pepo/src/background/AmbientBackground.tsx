import { useEffect, useRef } from 'react'
import { mulberry32 } from '../presence/orb/geometry'
import { ridge } from './ridges'

/** Must match --horizon in index.css. */
const HORIZON = { desktop: 0.66, mobile: 0.64 }

/**
 * The far depth plane: a night lake under a dusk horizon. It is painted
 * once per resize onto a canvas (nothing animates here except a slow
 * pointer parallax), and kept dim enough that PEPO always leads.
 */
function paint(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const hy = Math.round(h * (w <= 640 ? HORIZON.mobile : HORIZON.desktop))
  const rand = mulberry32(42)

  // Sky
  const sky = ctx.createLinearGradient(0, 0, 0, hy)
  sky.addColorStop(0, '#030812')
  sky.addColorStop(0.45, '#071430')
  sky.addColorStop(0.85, '#0D1B3D')
  sky.addColorStop(1, '#16244A')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, hy)

  // A faint band of the Milky Way across the upper right.
  ctx.save()
  ctx.translate(w * 0.78, h * 0.22)
  ctx.rotate(-0.55)
  const band = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.32)
  band.addColorStop(0, 'rgba(120,140,220,0.07)')
  band.addColorStop(1, 'rgba(120,140,220,0)')
  ctx.scale(1, 0.28)
  ctx.fillStyle = band
  ctx.beginPath()
  ctx.arc(0, 0, w * 0.32, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Stars: sparse everywhere, denser inside the band.
  const star = (x: number, y: number, r: number, a: number, violet: boolean) => {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = violet ? `rgba(180,165,255,${a})` : `rgba(205,225,255,${a})`
    ctx.fill()
  }
  const count = Math.round((w * h) / 7000)
  for (let i = 0; i < count; i++) {
    const y = Math.pow(rand(), 1.4) * hy * 0.92
    const r = rand() < 0.95 ? 0.3 + rand() * 0.5 : 0.9 + rand() * 0.6
    star(rand() * w, y, r, (0.1 + rand() * 0.45) * (1 - y / (hy * 1.1)), rand() < 0.2)
  }
  for (let i = 0; i < count * 0.8; i++) {
    const t = (rand() - 0.5) * 2
    const off = (rand() + rand() + rand() - 1.5) * 0.05
    const x = w * (0.78 + t * 0.3 * Math.cos(-0.55) - off * Math.sin(-0.55))
    const y = h * 0.22 + w * (t * 0.3 * Math.sin(-0.55) + off * Math.cos(-0.55))
    if (y < 0 || y > hy * 0.8) continue
    star(x, y, 0.25 + rand() * 0.4, 0.08 + rand() * 0.22, rand() < 0.3)
  }

  // Dusk: a thin warm band at the horizon under a violet veil. Human warmth, held low.
  const dusk = ctx.createLinearGradient(0, hy - h * 0.2, 0, hy)
  dusk.addColorStop(0, 'rgba(110,80,170,0)')
  dusk.addColorStop(0.6, 'rgba(110,80,170,0.10)')
  dusk.addColorStop(0.9, 'rgba(214,140,120,0.13)')
  dusk.addColorStop(1, 'rgba(240,170,130,0.16)')
  ctx.fillStyle = dusk
  ctx.fillRect(0, hy - h * 0.2, w, h * 0.2)

  // Mountains, far to near. Each layer is lit faintly along its crest.
  // Ridges are generated across a virtual width and cropped to the centre,
  // so a phone shows a slice of the same range instead of squeezed spikes.
  const span = Math.max(w, 1400)
  const crop = (span - w) / 2
  const mh = Math.min(h, span * 0.62)
  const layers = [
    { seed: 3, height: mh * 0.2, rough: 0.8, valley: 1.2, top: '#1C2B55', bottom: '#0E1A38', crest: 'rgba(170,190,255,0.10)' },
    { seed: 9, height: mh * 0.27, rough: 1, valley: 1.5, top: '#111D3E', bottom: '#070F24', crest: 'rgba(150,180,255,0.08)' },
  ]
  const silhouettes: Float32Array[] = []
  for (const L of layers) {
    const samples = Math.max(160, Math.round(w / 4))
    const full = ridge(L.seed, Math.round(samples * (span / w)), L.rough, L.valley)
    const r = new Float32Array(samples + 1)
    for (let i = 0; i <= samples; i++) r[i] = full[Math.round(((crop + (i / samples) * w) / span) * (full.length - 1))]
    silhouettes.push(r)
    const grad = ctx.createLinearGradient(0, hy - L.height, 0, hy)
    grad.addColorStop(0, L.top)
    grad.addColorStop(1, L.bottom)
    ctx.beginPath()
    ctx.moveTo(0, hy)
    for (let i = 0; i <= samples; i++) ctx.lineTo((i / samples) * w, hy - r[i] * L.height)
    ctx.lineTo(w, hy)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    ctx.beginPath()
    for (let i = 0; i <= samples; i++) ctx.lineTo((i / samples) * w, hy - r[i] * L.height + 0.5)
    ctx.strokeStyle = L.crest
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // Lake
  const lake = ctx.createLinearGradient(0, hy, 0, h)
  lake.addColorStop(0, '#0B1633')
  lake.addColorStop(0.35, '#060D20')
  lake.addColorStop(1, '#030812')
  ctx.fillStyle = lake
  ctx.fillRect(0, hy, w, h - hy)

  // Reflection: the near ridge, mirrored and fading into the water.
  ctx.save()
  ctx.globalAlpha = 0.45
  const near = silhouettes[1]
  const L = layers[1]
  const samples = near.length - 1
  ctx.beginPath()
  ctx.moveTo(0, hy)
  for (let i = 0; i <= samples; i++) ctx.lineTo((i / samples) * w, hy + near[i] * L.height * 0.8)
  ctx.lineTo(w, hy)
  ctx.closePath()
  const refl = ctx.createLinearGradient(0, hy, 0, hy + L.height * 0.8)
  refl.addColorStop(0, 'rgba(20,32,70,0.9)')
  refl.addColorStop(1, 'rgba(20,32,70,0)')
  ctx.fillStyle = refl
  ctx.fill()
  ctx.restore()

  // Ripples catching the sky.
  for (let i = 0; i < 70; i++) {
    const y = hy + Math.pow(rand(), 1.8) * (h - hy)
    const len = 20 + rand() * 120
    const x = rand() * w
    ctx.fillStyle = `rgba(120,160,255,${0.02 + rand() * 0.04})`
    ctx.fillRect(x, y, len, 1)
  }

  // A few warm lights along the shore.
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1
    const x = w * (0.5 + side * (0.2 + rand() * 0.28))
    const y = hy - 0.5 - rand() * 1.5
    const g = ctx.createRadialGradient(x, y, 0, x, y, 2.2)
    g.addColorStop(0, 'rgba(255,205,160,0.4)')
    g.addColorStop(1, 'rgba(255,205,160,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - 2.5, y - 2.5, 5, 5)
    const streak = ctx.createLinearGradient(0, hy, 0, hy + 16)
    streak.addColorStop(0, 'rgba(255,190,140,0.07)')
    streak.addColorStop(1, 'rgba(255,190,140,0)')
    ctx.fillStyle = streak
    ctx.fillRect(x - 0.5, hy + 1, 1, 16)
  }

  // Horizon line where sky meets water.
  ctx.fillStyle = 'rgba(160,190,255,0.06)'
  ctx.fillRect(0, hy, w, 1)
}

export function AmbientBackground() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    let raf = 0
    const draw = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => paint(el))
    }
    paint(el)
    window.addEventListener('resize', draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', draw)
    }
  }, [])

  return (
    <div className="ambient" aria-hidden="true">
      <canvas ref={canvas} className="ambient-canvas parallax-far" />
      <div className="ambient-orb-reflection" />
      <div className="ambient-vignette" />
    </div>
  )
}
