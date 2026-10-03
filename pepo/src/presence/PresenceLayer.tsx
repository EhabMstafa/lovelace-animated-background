import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { usePresence } from '../core/presence'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { FrameGovernor } from './FrameGovernor'
import { PresenceBody } from './PresenceBody'

const CALM_STATES = new Set(['idle', 'waiting'])

/**
 * The mid depth plane: PEPO's body, as the Orb or the point-cloud Avatar.
 */
export function PresenceLayer({ compact = false }: { compact?: boolean }) {
  const { state, form } = usePresence()
  const reducedMotion = useReducedMotion()

  const counts = useMemo(
    () =>
      compact
        ? { shell: 1100, inner: 380, halo: 150, total: 60000 }
        : { shell: 1700, inner: 620, halo: 240, total: 160891 },
    [compact],
  )

  // Full frame rate while the body is transforming between Orb and Avatar.
  const [transforming, setTransforming] = useState(false)
  useEffect(() => {
    setTransforming(true)
    const id = window.setTimeout(() => setTransforming(false), 2200)
    return () => window.clearTimeout(id)
  }, [form])

  // The Avatar's blinks and eye movements need full frame rate to look human.
  const fps = reducedMotion ? 24 : transforming || form === 'avatar' || !CALM_STATES.has(state) ? 60 : 30

  return (
    <div className="presence-stage" aria-hidden="true">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 32, position: [0, 0, 8.2], near: 0.1, far: 50 }}
      >
        <FrameGovernor fps={fps} />
        <PresenceBody state={state} form={form} reducedMotion={reducedMotion} counts={counts} />
      </Canvas>
    </div>
  )
}
