import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { setPresenceForm } from '../chrome/PresenceToggle'
import { PRESENCE_STATES, presence, usePresence, type PresenceState } from '../core/presence'
import { theme, useTheme } from '../core/theme'

const ENERGY_STATES = new Set<PresenceState>(['listening', 'speaking'])
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-']

/**
 * DEVELOPMENT ONLY: a hidden test panel (Shift+D) to force any presence
 * state, the presentation (Avatar / Orb) and the theme. Nothing of it shows
 * in the normal interface; while it is open, keys 1–9, 0 and - pick states.
 */
export function StatePicker() {
  const { state, form } = usePresence()
  const current = useTheme()
  const [open, setOpen] = useState(false)

  const pick = (s: PresenceState) => presence.update({ state: s, caption: null, transcript: null })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        setOpen((o) => !o)
        return
      }
      if (!open) return
      const i = KEYS.indexOf(e.key)
      if (i >= 0 && i < PRESENCE_STATES.length) pick(PRESENCE_STATES[i])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // States that react to energy get a synthetic signal when picked here.
  useEffect(() => {
    if (!open || !ENERGY_STATES.has(state) || state === 'listening') return
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
  }, [state, open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dev-panel surface"
          role="dialog"
          aria-label="Development controls"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.18 }}
        >
          <p className="dev-title">Dev · Shift+D</p>
          <ul>
            {PRESENCE_STATES.map((s, i) => (
              <li key={s}>
                <button className={s === state ? 'is-active' : ''} onClick={() => pick(s)}>
                  <kbd>{KEYS[i]}</kbd>
                  {s}
                </button>
              </li>
            ))}
          </ul>
          <div className="dev-row">
            {(['avatar', 'orb'] as const).map((f) => (
              <button key={f} className={form === f ? 'is-active' : ''} onClick={() => setPresenceForm(f)}>
                {f}
              </button>
            ))}
          </div>
          <div className="dev-row">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} className={current === t ? 'is-active' : ''} onClick={() => theme.set(t)}>
                {t}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
