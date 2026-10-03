import { useEffect, useRef } from 'react'
import { mulberry32 } from '../presence/orb/geometry'
import { FAR_RIDGE, NEAR_RIDGE } from './ridges'

/**
 * The far depth plane. A night lake held at ~5–10% intensity: it gives
 * PEPO a place to exist without competing with anything on top of it.
 * Everything here is static except a slow pointer parallax via CSS vars.
 */
export function AmbientBackground() {
  const stars = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = stars.current
    if (!canvas) return
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)
      const rand = mulberry32(42)
      const count = Math.round((w * h) / 9000)
      for (let i = 0; i < count; i++) {
        const x = rand() * w
        // Stars thin out towards the horizon.
        const y = Math.pow(rand(), 1.5) * h * 0.66
        const r = rand() < 0.94 ? 0.35 + rand() * 0.5 : 0.9 + rand() * 0.5
        const a = (0.08 + rand() * 0.35) * (1 - y / (h * 0.75))
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = rand() < 0.2 ? `rgba(176,160,255,${a})` : `rgba(200,225,255,${a})`
        ctx.fill()
      }
    }
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [])

  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-sky" />
      <canvas ref={stars} className="ambient-stars parallax-far" />
      <div className="ambient-horizon-glow" />
      <svg className="ambient-ridges parallax-far" viewBox="0 0 1600 400" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ridge-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#13234A" stopOpacity="0.55" />
            <stop offset="1" stopColor="#071225" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="ridge-near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0E1B3A" stopOpacity="0.9" />
            <stop offset="1" stopColor="#050B18" stopOpacity="1" />
          </linearGradient>
        </defs>
        <path d={FAR_RIDGE} fill="url(#ridge-far)" />
        <path d={NEAR_RIDGE} fill="url(#ridge-near)" />
      </svg>
      <div className="ambient-lake">
        <svg className="ambient-reflection" viewBox="0 0 1600 400" preserveAspectRatio="none">
          <path d={NEAR_RIDGE} fill="#0B1734" />
        </svg>
        <div className="ambient-orb-reflection" />
      </div>
      <div className="ambient-vignette" />
    </div>
  )
}
