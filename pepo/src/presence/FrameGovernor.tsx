import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'

/**
 * The canvas runs with frameloop="demand"; this paces redraws.
 * Calm states don't need 60 fps, and a hidden tab needs none at all
 * (requestAnimationFrame stops on its own).
 */
export function FrameGovernor({ fps }: { fps: number }) {
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    const interval = 1000 / fps
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      if (now - last >= interval - 1.5) {
        last = now
        invalidate()
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [fps, invalidate])

  return null
}
