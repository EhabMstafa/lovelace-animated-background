import { useEffect, useSyncExternalStore } from 'react'
import { AmbientBackground } from '../background/AmbientBackground'
import { AdaptiveDock } from '../chrome/AdaptiveDock'
import { GlobalHeader } from '../chrome/GlobalHeader'
import { NavigationRail } from '../chrome/NavigationRail'
import { usePresence } from '../core/presence'
import { DemoConductor } from '../demo/DemoConductor'
import { StatePicker } from '../demo/StatePicker'
import { PresenceLayer } from '../presence/PresenceLayer'
import { SpatialWorkspace } from '../workspace/SpatialWorkspace'
import { PresenceCaption } from '../voice/PresenceCaption'
import { VoiceSurface } from '../voice/VoiceSurface'

const compactQuery = '(max-width: 640px)'
function useCompact() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(compactQuery)
      m.addEventListener('change', cb)
      return () => m.removeEventListener('change', cb)
    },
    () => window.matchMedia(compactQuery).matches,
  )
}

/** Pointer parallax for the far plane, written to CSS variables (no re-render). */
function useParallaxVars() {
  useEffect(() => {
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const root = document.documentElement
        root.style.setProperty('--px', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3))
        root.style.setProperty('--py', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3))
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])
}

interface PEPOAppProps {
  /** Mount the scripted stand-in runtime and the state review tool. */
  demo?: boolean
}

/**
 * PEPO. Three depth planes:
 *   far  – AmbientBackground
 *   mid  – PresenceLayer (the Orb or the Avatar)
 *   near – SpatialWorkspace (tools PEPO places), header, caption, voice surface, dock, navigation
 */
export function PEPOApp({ demo = true }: PEPOAppProps) {
  const compact = useCompact()
  const { state, caption } = usePresence()
  useParallaxVars()

  return (
    <div className="pepo" data-presence={state}>
      <AmbientBackground />
      <PresenceLayer compact={compact} />
      <SpatialWorkspace />

      <GlobalHeader />
      {!compact && <NavigationRail />}

      <main className="near-plane">
        <PresenceCaption text={caption} />
        <VoiceSurface />
        <AdaptiveDock compact={compact} />
      </main>

      {demo && (
        <>
          <DemoConductor />
          <StatePicker />
        </>
      )}
    </div>
  )
}
