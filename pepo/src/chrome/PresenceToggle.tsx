import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Orbit, ScanFace } from 'lucide-react'
import { pepoEvents } from '../core/events'
import { presence, usePresence, type PresenceForm } from '../core/presence'
import { ease } from '../core/tokens'

const STORAGE_KEY = 'pepo.form'

const OPTIONS: { form: PresenceForm; label: string; icon: typeof Orbit }[] = [
  { form: 'orb', label: 'Orb', icon: Orbit },
  { form: 'avatar', label: 'Avatar', icon: ScanFace },
]

export function setPresenceForm(form: PresenceForm) {
  if (presence.getSnapshot().form === form) return
  presence.update({ form })
  pepoEvents.emit('formChange', { form })
  try {
    localStorage.setItem(STORAGE_KEY, form)
  } catch {
    // Storage unavailable (private window, sandbox): the choice lasts this visit only.
  }
}

/**
 * Chooses which body PEPO wears: the Orb or the point-cloud Avatar.
 * Each keeps its own listening, thinking and speaking behaviour; switching
 * plays the transformation between them. Remembered per viewer. Key: A.
 */
export function PresenceToggle() {
  const { form } = usePresence()

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'orb' || saved === 'avatar') presence.update({ form: saved })
    } catch {
      // No stored preference available.
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'a' || e.key === 'A') setPresenceForm(presence.getSnapshot().form === 'orb' ? 'avatar' : 'orb')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="form-toggle" role="radiogroup" aria-label="PEPO's form">
      {OPTIONS.map(({ form: f, label, icon: Icon }) => {
        const active = form === f
        return (
          <button
            key={f}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={`${label} (A)`}
            className={`form-option ${active ? 'is-active' : ''}`}
            onClick={() => setPresenceForm(f)}
          >
            {active && (
              <motion.span layoutId="form-indicator" className="form-indicator" transition={{ duration: 0.32, ease: ease.out }} />
            )}
            <Icon size={14} strokeWidth={1.5} />
            <span className="form-label">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
