import { useEffect, useRef, useState } from 'react'
import { presence, type PresenceState } from '../../core/presence'
import { workspace } from '../../core/workspace'
import { serveFathiAssets } from './embeddedAssets'
import type { FathiAvatar as FathiInstance, FathiState } from './fathi-avatar'

/** PEPO's presence states, in FATHI's own vocabulary. */
const FATHI_STATE: Record<PresenceState, FathiState> = {
  idle: 'idle',
  waiting: 'idle',
  listening: 'listening',
  understanding: 'thinking',
  thinking: 'thinking',
  working: 'tool-active',
  speaking: 'speaking',
}

const FADE_MS = 1100

interface FathiAvatarProps {
  visible: boolean
  state: PresenceState
  reducedMotion: boolean
  /** Called once FATHI is drawn (true), or if it can't run here (false). */
  onReady: (ready: boolean) => void
}

/**
 * The Avatar: FATHI's original renderer, drawing, depth and motion
 * controller, used exactly as exported (see ./USAGE.txt). PEPO only tells it
 * the state, the voice level and where the pointer is. It is created the
 * first time the Avatar is chosen and then kept alive, paused while hidden.
 */
export function FathiAvatar({ visible, state, reducedMotion, onReady }: FathiAvatarProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const avatar = useRef<FathiInstance | null>(null)
  const [wanted, setWanted] = useState(visible)
  const [ready, setReady] = useState(false)
  const readyCb = useRef(onReady)
  readyCb.current = onReady

  useEffect(() => {
    if (visible) setWanted(true)
  }, [visible])

  // Create once, on first use.
  useEffect(() => {
    if (!wanted || !canvas.current) return
    let cancelled = false
    serveFathiAssets()
    import('./fathi-avatar.js')
      .then(({ createFathiAvatar }) => createFathiAvatar(canvas.current!, { motion: true }))
      .then((instance) => {
        if (cancelled) return instance.dispose()
        avatar.current = instance
        setReady(true)
        readyCb.current(true)
      })
      .catch((error) => {
        console.warn('[PEPO] FATHI could not start here; staying with the Orb.', error)
        readyCb.current(false)
        presence.update({ form: 'orb' })
      })
    return () => {
      cancelled = true
      avatar.current?.dispose()
      avatar.current = null
    }
  }, [wanted])

  // Run while shown, pause once faded out.
  useEffect(() => {
    const a = avatar.current
    if (!a || !ready) return
    if (visible) {
      a.setReduced(reducedMotion)
      a.start()
      return
    }
    const id = window.setTimeout(() => a.stop(), FADE_MS)
    return () => window.clearTimeout(id)
  }, [visible, ready, reducedMotion])

  // State, and the voice level while listening or speaking (the controller
  // keeps the microphone from lighting the speech mask).
  useEffect(() => {
    const a = avatar.current
    if (!a || !ready) return
    a.setState(FATHI_STATE[state])
    if (!visible || (state !== 'speaking' && state !== 'listening')) {
      a.setAmplitude(0)
      a.setSpectrum([])
      a.setFormants(null, null)
      return
    }
    const id = window.setInterval(() => a.setAmplitude(presence.getEnergy()), 50)
    return () => {
      window.clearInterval(id)
      a.setAmplitude(0)
    }
  }, [state, visible, ready])

  // FATHI looks toward the pointer while it is over him.
  useEffect(() => {
    if (!ready || !visible || reducedMotion) return
    const onMove = (e: PointerEvent) => {
      const a = avatar.current
      const el = canvas.current
      if (!a || !el) return
      const r = el.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * 2 - 1
      const y = 1 - ((e.clientY - r.top) / r.height) * 2
      if (Math.abs(x) <= 1 && Math.abs(y) <= 1) a.setPointer(x, y, true)
      else a.setPointer(0, 0, false)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      avatar.current?.setPointer(0, 0, false)
    }
  }, [ready, visible, reducedMotion])

  // Keep the drawing sharp as the stage resizes or scales (PEPO stepping aside).
  useEffect(() => {
    if (!ready || !canvas.current) return
    const resize = () => avatar.current?.resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas.current)
    let settle = 0
    const afterMove = () => {
      window.clearTimeout(settle)
      settle = window.setTimeout(resize, FADE_MS + 100)
    }
    const offWorkspace = workspace.subscribe(afterMove)
    window.addEventListener('resize', afterMove)
    return () => {
      observer.disconnect()
      offWorkspace()
      window.removeEventListener('resize', afterMove)
      window.clearTimeout(settle)
    }
  }, [ready])

  return <canvas ref={canvas} className={`fathi-avatar ${visible && ready ? 'is-visible' : ''}`} />
}
