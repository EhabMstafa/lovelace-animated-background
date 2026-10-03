import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorBoundary } from '../app/ErrorBoundary'
import { usePresence } from '../core/presence'
import { useWorkspace } from '../core/workspace'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { FrameGovernor } from './FrameGovernor'
import { QualityGovernor } from './QualityGovernor'
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
  // While PEPO works beside open surfaces it is smaller and the page is busier:
  // it keeps a steady 30 fps when calm and renders at a lower resolution.
  const busy = useWorkspace().length > 0
  const calm = CALM_STATES.has(state) || state === 'working'
  const fps = reducedMotion ? 24 : transforming || (form === 'avatar' && !busy) || !calm ? 60 : 30
  const maxDpr = busy ? 1.5 : 2

  // If the graphics context is lost (driver reset, GPU memory pressure) and the
  // browser doesn't restore it, start a fresh canvas instead of staying blank.
  const [generation, setGeneration] = useState(0)
  const restartTimer = useRef(0)
  const restart = () => {
    window.clearTimeout(restartTimer.current)
    restartTimer.current = window.setTimeout(() => setGeneration((g) => g + 1), 1200)
  }
  useEffect(() => () => window.clearTimeout(restartTimer.current), [])

  return (
    <div className="presence-stage" aria-hidden="true">
      <ErrorBoundary key={generation} label="presence" onError={restart}>
        <Canvas
          frameloop="demand"
          // Measure the layout size: the stage is scaled with a CSS transform when PEPO steps aside.
          resize={{ offsetSize: true }}
          dpr={[1, maxDpr]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          camera={{ fov: 32, position: [0, 0, 8.2], near: 0.1, far: 50 }}
          onCreated={({ gl }) => {
            const canvas = gl.domElement
            canvas.addEventListener('webglcontextlost', restart)
            canvas.addEventListener('webglcontextrestored', () => window.clearTimeout(restartTimer.current))
          }}
        >
          <FrameGovernor fps={fps} />
          <QualityGovernor fps={fps} max={maxDpr} />
          <PresenceBody state={state} form={form} reducedMotion={reducedMotion} counts={counts} />
        </Canvas>
      </ErrorBoundary>
    </div>
  )
}
