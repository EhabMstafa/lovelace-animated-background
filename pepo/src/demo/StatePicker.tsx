import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PRESENCE_STATES, presence, usePresence, type PresenceState } from '../core/presence'

const ENERGY_STATES = new Set<PresenceState>(['listening', 'speaking'])

/**
 * DEMO ONLY: review tool for the Orb's state language. Keys 1–7 switch
 * states directly; the small corner mark reveals the list.
 */
export function StatePicker() {
  const { state } = usePresence()
  const [open, setOpen] = useState(false)

  const pick = (s: PresenceState) => {
    presence.update({ state: s, caption: null, transcript: null })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= PRESENCE_STATES.length) pick(PRESENCE_STATES[n - 1])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // States that react to energy get a synthetic signal when picked manually.
  useEffect(() => {
    if (!ENERGY_STATES.has(state) || state === 'listening') return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / 1000
      const phrase = Math.max(0, Math.sin(t * 1.7)) ** 0.5
      presence.setEnergy(phrase * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 21 + Math.sin(t * 4) * 2))))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      presence.setEnergy(0)
    }
  }, [state])

  return (
    <div className="state-picker">
      <AnimatePresence>
        {open && (
          <motion.ul
            className="surface"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2 }}
          >
            {PRESENCE_STATES.map((s, i) => (
              <li key={s}>
                <button className={s === state ? 'is-active' : ''} onClick={() => pick(s)}>
                  <kbd>{i + 1}</kbd>
                  {s}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
      <button className="state-picker-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Presence states (demo)">
        <span>{state}</span>
      </button>
    </div>
  )
}
