import { useEffect, useRef, useState } from 'react'
import { pepoEvents } from '../../core/events'
import { presence, type PresenceState } from '../../core/presence'
import { workspace } from '../../core/workspace'
import { serveFathiAssets } from './embeddedAssets'
import type { FathiAvatar as FathiInstance, FathiState } from './fathi-avatar'
import { createHumanMotion } from './humanMotion'

/** PEPO's states in FATHI's vocabulary, for FATHI's own per-state lighting. */
const FATHI_LIGHT: Record<PresenceState, FathiState> = {
  idle: 'idle',
  attentive: 'listening',
  listening: 'listening',
  understanding: 'thinking',
  thinking: 'thinking',
  speaking: 'speaking',
  interrupted: 'listening',
  working: 'tool-active',
  waiting: 'idle',
  success: 'idle',
  error: 'error',
}

/** The Avatar's body language groups PEPO's states a little differently. */
const BEHAVIOUR: Record<PresenceState, Parameters<ReturnType<typeof createHumanMotion>['setPresence']>[0]> = {
  idle: 'idle',
  attentive: 'attentive',
  listening: 'listening',
  understanding: 'thinking',
  thinking: 'thinking',
  speaking: 'speaking',
  interrupted: 'interrupted',
  working: 'working',
  waiting: 'waiting',
  success: 'success',
  error: 'error',
}

/** Switching forms is a presentation change only: a short, soft cross-fade. */
export const SWITCH_MS = 350

interface FathiAvatarProps {
  visible: boolean
  /** Load FATHI ahead of time (while the Orb is shown) so the first switch is instant. */
  preload: boolean
  state: PresenceState
  reducedMotion: boolean
  /** Small screen: the same motion, a little smaller. */
  compact: boolean
  /** Called once FATHI is drawn (true), or if it can't run here (false). */
  onReady: (ready: boolean) => void
}

/**
 * The Avatar: FATHI's original renderer, drawing and rig, used as exported
 * (see ./USAGE.txt). Its behaviour comes from PEPO's natural motion
 * controller (./humanMotion.ts), passed in through FATHI's `controller`
 * option. PEPO tells it the presence state, the voice level, the pointer and
 * semantic cues. It is kept alive once created and paused while hidden, so
 * switching never interrupts anything: only the presentation changes.
 */
export function FathiAvatar({ visible, preload, state, reducedMotion, compact, onReady }: FathiAvatarProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const avatar = useRef<FathiInstance | null>(null)
  const controller = useRef(createHumanMotion())
  const [wanted, setWanted] = useState(visible || preload)
  const [ready, setReady] = useState(false)
  const readyCb = useRef(onReady)
  readyCb.current = onReady

  useEffect(() => {
    if (visible || preload) setWanted(true)
  }, [visible, preload])

  // Create once, on first use.
  useEffect(() => {
    if (!wanted || !canvas.current) return
    let cancelled = false
    serveFathiAssets()
    import('./fathi-avatar.js')
      .then(({ createFathiAvatar }) => createFathiAvatar(canvas.current!, { motion: true, controller: controller.current }))
      .then((instance) => {
        if (cancelled) return instance.dispose()
        avatar.current = instance
        instance.stop()
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

  // Reduced motion keeps FATHI alive (breath, blinks, jaw) through PEPO's
  // controller; FATHI's own setReduced would freeze it, so it isn't used.
  useEffect(() => controller.current.setReduced(reducedMotion), [reducedMotion])

  // Run while shown and the page is visible; pause once faded out or when the
  // tab is hidden (FATHI paces itself with timers, which keep running in a
  // background tab). On return it resumes from now, without replaying.
  useEffect(() => {
    const a = avatar.current
    if (!a || !ready) return
    if (!visible) {
      const id = window.setTimeout(() => a.stop(), SWITCH_MS)
      return () => window.clearTimeout(id)
    }
    const sync = () => (document.hidden ? a.stop() : a.start())
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [visible, ready])

  // State (kept current even while hidden, so a switch shows the right
  // behaviour at once), and the voice level while listening or speaking. The
  // controller only lets speech output move the jaw.
  useEffect(() => {
    const a = avatar.current
    if (!a || !ready) return
    a.setState(FATHI_LIGHT[state])
    controller.current.setPresence(BEHAVIOUR[state])
    // Understanding what was said: a tiny brow response.
    if (state === 'understanding' && visible) controller.current.gesture('understand')
    if (!visible || (state !== 'speaking' && state !== 'listening')) {
      a.setAmplitude(0)
      return
    }
    const id = window.setInterval(() => a.setAmplitude(presence.getEnergy()), 50)
    return () => {
      window.clearInterval(id)
      a.setAmplitude(0)
    }
  }, [state, visible, ready])

  // Meaning from the runtime: restrained gestures, never on every sentence.
  useEffect(() => {
    const off = pepoEvents.on('cue', ({ kind }) => {
      if (visible) avatar.current?.gesture(kind)
    })
    return () => {
      off()
    }
  }, [visible])

  useEffect(() => controller.current.setScale(compact ? 0.68 : 0.9), [compact])

  // A surface PEPO opens: a brief glance toward it, then back to the user.
  useEffect(
    () =>
      pepoEvents.on('surfaceShown', ({ dx, dy }) => {
        if (visible) controller.current.lookToward(dx, dy)
      }),
    [visible],
  )

  // FATHI notices the pointer while it is over him.
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

  // Keep the drawing sharp as the stage resizes (PEPO stepping aside).
  useEffect(() => {
    if (!ready || !canvas.current) return
    const resize = () => avatar.current?.resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas.current)
    let settle = 0
    const afterMove = () => {
      window.clearTimeout(settle)
      settle = window.setTimeout(resize, 900)
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
