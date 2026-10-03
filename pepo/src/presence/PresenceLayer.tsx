import { Canvas } from '@react-three/fiber'
import { useMemo } from 'react'
import { usePresence } from '../core/presence'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { FrameGovernor } from './FrameGovernor'
import { Orb } from './orb/Orb'

const CALM_STATES = new Set(['idle', 'waiting'])

/**
 * The mid depth plane: PEPO's body. In Scene 1 that is always the Orb;
 * the Avatar and the Orb ↔ Avatar transition will live here as well.
 */
export function PresenceLayer({ compact = false }: { compact?: boolean }) {
  const { state } = usePresence()
  const reducedMotion = useReducedMotion()

  const counts = useMemo(
    () => (compact ? { shell: 1100, inner: 380, halo: 150 } : { shell: 1700, inner: 620, halo: 240 }),
    [compact],
  )

  const fps = reducedMotion ? 24 : CALM_STATES.has(state) ? 30 : 60

  return (
    <div className="presence-stage" aria-hidden="true">
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: 32, position: [0, 0, 8.2], near: 0.1, far: 50 }}
      >
        <FrameGovernor fps={fps} />
        <Orb state={state} reducedMotion={reducedMotion} counts={counts} />
      </Canvas>
    </div>
  )
}
