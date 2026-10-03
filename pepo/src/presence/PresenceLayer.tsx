import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorBoundary } from '../app/ErrorBoundary'
import { usePresence } from '../core/presence'
import { useWorkspace } from '../core/workspace'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { FathiAvatar } from './fathi/FathiAvatar'
import { FrameGovernor } from './FrameGovernor'
import { QualityGovernor } from './QualityGovernor'
import { PresenceBody } from './PresenceBody'

const CALM_STATES = new Set(['idle', 'waiting'])

/**
 * The mid depth plane: PEPO's body, as the Orb (WebGL, below) or the Avatar
 * (FATHI's own renderer, on its own canvas above it).
 */
export function PresenceLayer({ compact = false }: { compact?: boolean }) {
  const { state, form } = usePresence()
  const reducedMotion = useReducedMotion()

  const counts = useMemo(
    () =>
      compact
        ? { shell: 1100, inner: 380, halo: 150 }
        : { shell: 1700, inner: 620, halo: 240 },
    [compact],
  )

  // FATHI is loaded in the background shortly after start, so switching is
  // instant. Choosing the Avatar hides the Orb at once (it never flashes up
  // while FATHI loads); if FATHI can't run, the form returns to the Orb.
  const [, setFathiReady] = useState(false)
  const avatar = form === 'avatar'
  const [preload, setPreload] = useState(false)
  useEffect(() => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const id = window.setTimeout(() => (idle ? idle(() => setPreload(true), { timeout: 2000 }) : setPreload(true)), 2500)
    return () => window.clearTimeout(id)
  }, [])

  // Full frame rate while the Orb fades out or back in.
  const [transforming, setTransforming] = useState(false)
  useEffect(() => {
    setTransforming(true)
    const id = window.setTimeout(() => setTransforming(false), 900)
    return () => window.clearTimeout(id)
  }, [avatar])

  // While PEPO works beside open surfaces it is smaller and the page is busier:
  // it keeps a steady 30 fps when calm and renders at a lower resolution.
  // With the Avatar shown, the Orb's canvas has nothing to draw and pauses.
  const busy = useWorkspace().length > 0
  const calm = CALM_STATES.has(state) || state === 'working'
  const fps = avatar && !transforming ? 0 : reducedMotion ? 24 : transforming || !calm ? 60 : 30
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
    <>
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
          <PresenceBody state={state} form={avatar ? 'avatar' : 'orb'} reducedMotion={reducedMotion} counts={counts} />
        </Canvas>
      </ErrorBoundary>
    </div>
    {/* FATHI sizes its drawing from its on-screen box, so it sits outside the
        scaled stage and is resized for real rather than scaled. */}
    <div className="fathi-stage" aria-hidden="true">
      <ErrorBoundary label="avatar" onError={() => setFathiReady(false)}>
        <FathiAvatar visible={form === 'avatar'} preload={preload} compact={compact} state={state} reducedMotion={reducedMotion} onReady={setFathiReady} />
      </ErrorBoundary>
    </div>
    </>
  )
}
