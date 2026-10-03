import { useEffect, useRef } from 'react'
import { presence } from '../core/presence'

const BARS = 15

/** A small, quiet level meter, only mounted while PEPO is listening. */
export function Waveform() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bars = Array.from(ref.current?.children ?? []) as HTMLElement[]
    const levels = new Float32Array(BARS)
    let raf = 0
    const tick = (now: number) => {
      const e = presence.getEnergy()
      const t = now / 1000
      bars.forEach((bar, i) => {
        const centre = 1 - Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2)
        const target = 0.08 + e * (0.25 + 0.75 * centre) * (0.55 + 0.45 * Math.sin(t * 9 + i * 1.7))
        levels[i] += (target - levels[i]) * 0.25
        bar.style.transform = `scaleY(${levels[i].toFixed(3)})`
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={ref} className="waveform" aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} />
      ))}
    </div>
  )
}
