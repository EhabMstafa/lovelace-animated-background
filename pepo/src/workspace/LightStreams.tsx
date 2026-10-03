import { useEffect, useRef } from 'react'
import { theme } from '../core/theme'
import type { Rect } from './layout'

export interface StreamTarget {
  id: string
  rect: Rect
  /** PEPO is writing here: light keeps flowing. */
  active: boolean
  /** When the surface appeared (performance.now): a burst of light places it. */
  openedAt: number
}

interface Particle {
  target: string
  born: number
  life: number
  offset: number
}

/**
 * The visible link between PEPO and its work: fine particles of light
 * travel from the presence to whichever surface it is acting on. Drawn on
 * a 2D canvas over the workspace; the loop only runs while light flows.
 */
export function LightStreams({ origin, targets }: { origin: { x: number; y: number }; targets: StreamTarget[] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const state = useRef({ origin, targets })
  state.current = { origin, targets }

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    let raf = 0
    let running = false
    const particles: Particle[] = []
    const lastSpawn = new Map<string, number>()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const resize = () => {
      el.width = window.innerWidth * dpr
      el.height = window.innerHeight * dpr
    }
    resize()
    window.addEventListener('resize', resize)

    const curve = (o: { x: number; y: number }, r: Rect) => {
      // Arrive at the edge of the surface that faces PEPO.
      const ex = o.x < r.x ? r.x : o.x > r.x + r.w ? r.x + r.w : r.x + r.w / 2
      const ey = o.x < r.x || o.x > r.x + r.w ? r.y + Math.min(r.h * 0.5, 120) : o.y < r.y ? r.y : r.y + r.h
      const dx = ex - o.x
      return { p0: o, c1: { x: o.x + dx * 0.35, y: o.y - 70 }, c2: { x: ex - dx * 0.25, y: ey }, p1: { x: ex, y: ey } }
    }
    const at = (c: ReturnType<typeof curve>, t: number) => {
      const u = 1 - t
      return {
        x: u * u * u * c.p0.x + 3 * u * u * t * c.c1.x + 3 * u * t * t * c.c2.x + t * t * t * c.p1.x,
        y: u * u * u * c.p0.y + 3 * u * u * t * c.c1.y + 3 * u * t * t * c.c2.y + t * t * t * c.p1.y,
      }
    }

    const frame = (now: number) => {
      const { origin: o, targets: ts } = state.current
      // Light on a dark page; ink-blue on a light one.
      const light = theme.get() === 'light'
      const head = light ? '18,112,184' : '220,245,255'
      const trail = light ? '22,131,196' : '64,200,255'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, el.width, el.height)
      let alive = false
      for (const t of ts) {
        const burst = now - t.openedAt < 1600
        const flowing = t.active || burst
        if (flowing) {
          alive = true
          const every = burst ? 75 : 190
          if (now - (lastSpawn.get(t.id) ?? 0) > every) {
            particles.push({ target: t.id, born: now, life: 900 + Math.random() * 500, offset: (Math.random() - 0.5) * 14 })
            lastSpawn.set(t.id, now)
          }
          // The faint thread itself.
          const c = curve(o, t.rect)
          ctx.beginPath()
          ctx.moveTo(c.p0.x, c.p0.y)
          ctx.bezierCurveTo(c.c1.x, c.c1.y, c.c2.x, c.c2.y, c.p1.x, c.p1.y)
          const g = ctx.createLinearGradient(c.p0.x, c.p0.y, c.p1.x, c.p1.y)
          g.addColorStop(0, 'rgba(64,230,255,0.0)')
          g.addColorStop(0.3, `rgba(${trail},${burst ? 0.15 : 0.085})`)
          g.addColorStop(1, `rgba(139,92,255,${burst ? 0.16 : 0.08})`)
          ctx.strokeStyle = g
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        const target = ts.find((t) => t.id === p.target)
        const k = (now - p.born) / p.life
        if (!target || k >= 1) {
          particles.splice(i, 1)
          continue
        }
        alive = true
        const c = curve(o, target.rect)
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
        for (let s = 0; s < 5; s++) {
          const pt = at(c, Math.max(0, e - s * 0.018))
          const fade = Math.sin(Math.PI * k) * (1 - s / 5)
          ctx.beginPath()
          ctx.arc(pt.x, pt.y + p.offset * Math.sin(Math.PI * e), s === 0 ? 1.7 : 1.1, 0, Math.PI * 2)
          ctx.fillStyle = s === 0 ? `rgba(${head},${0.9 * fade})` : `rgba(${trail},${0.45 * fade})`
          ctx.fill()
        }
      }
      if (alive) raf = requestAnimationFrame(frame)
      else {
        running = false
        ctx.clearRect(0, 0, el.width, el.height)
      }
    }
    const kick = () => {
      if (running) return
      running = true
      raf = requestAnimationFrame(frame)
    }
    const id = window.setInterval(() => {
      const now = performance.now()
      if (state.current.targets.some((t) => t.active || now - t.openedAt < 1600)) kick()
    }, 120)
    kick()
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(id)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={canvas} className="light-streams" aria-hidden="true" />
}
