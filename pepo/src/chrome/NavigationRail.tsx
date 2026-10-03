import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, Folder, House, ListChecks, MessagesSquare, PanelsTopLeft, Settings2, Wrench } from 'lucide-react'
import { pepoEvents } from '../core/events'
import { ease } from '../core/tokens'

const DESTINATIONS = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'workspace', label: 'Workspace', icon: PanelsTopLeft },
  { id: 'conversations', label: 'Conversations', icon: MessagesSquare },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'files', label: 'Files', icon: Folder },
  { id: 'tools', label: 'Tools', icon: Wrench },
] as const

/**
 * Hidden contextual rail. A faint hairline at the left edge is the only
 * trace of it until the pointer arrives (or keyboard focus does).
 */
export function NavigationRail() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<string>('home')

  const go = (id: string) => {
    setActive(id)
    pepoEvents.emit('navigate', { destination: id })
  }

  return (
    <nav
      className={`nav-zone ${open ? 'is-open' : ''}`}
      aria-label="Primary"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
      }}
    >
      <motion.span
        className="nav-handle"
        animate={{ opacity: open ? 0 : 1 }}
        transition={{ duration: 0.2 }}
      />
      <AnimatePresence>
        {open && (
          <motion.ul
            className="nav-rail surface"
            initial={{ opacity: 0, x: -10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -8, filter: 'blur(4px)' }}
            transition={{ duration: 0.26, ease: ease.out }}
          >
            {DESTINATIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <button
                  className={`nav-item ${active === id ? 'is-active' : ''}`}
                  onClick={() => go(id)}
                  aria-current={active === id ? 'page' : undefined}
                >
                  <Icon size={17} strokeWidth={1.4} />
                  <span className="nav-label">{label}</span>
                </button>
              </li>
            ))}
            <li className="nav-divider" aria-hidden="true" />
            <li>
              <button className={`nav-item ${active === 'settings' ? 'is-active' : ''}`} onClick={() => go('settings')}>
                <Settings2 size={17} strokeWidth={1.4} />
                <span className="nav-label">Settings</span>
              </button>
            </li>
          </motion.ul>
        )}
      </AnimatePresence>
      {/* Keyboard users reach the rail through this invisible trigger. */}
      {!open && (
        <button className="sr-only" onFocus={() => setOpen(true)}>
          Open navigation
        </button>
      )}
    </nav>
  )
}
