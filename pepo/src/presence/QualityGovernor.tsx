import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * Keeps PEPO smooth on modest hardware: if frames consistently take much
 * longer than the paced target, rendering resolution steps down; with
 * steady headroom it climbs back slowly. Pauses (hidden tab) are ignored.
 */
export function QualityGovernor({ fps }: { fps: number }) {
  const setDpr = useThree((s) => s.setDpr)
  const max = Math.min(window.devicePixelRatio || 1, 2)
  const dpr = useRef(max)
  const stats = useRef({ last: 0, sum: 0, n: 0, calm: 0 })

  useFrame(() => {
    const now = performance.now()
    const st = stats.current
    const gap = now - st.last
    st.last = now
    if (gap <= 0 || gap > 250) return
    st.sum += gap
    st.n++
    if (st.n < 90) return
    const avg = st.sum / st.n
    const target = 1000 / fps
    st.sum = 0
    st.n = 0
    if (avg > target * 1.6 && dpr.current > 1) {
      dpr.current = Math.max(1, dpr.current - 0.5)
      st.calm = 0
      setDpr(dpr.current)
    } else if (avg < target * 1.12 && dpr.current < max) {
      if (++st.calm >= 6) {
        dpr.current = Math.min(max, dpr.current + 0.25)
        st.calm = 0
        setDpr(dpr.current)
      }
    } else st.calm = 0
  })
  return null
}
