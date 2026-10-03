import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSystemStatus } from '../core/status'
import { ease } from '../core/tokens'

/**
 * One quiet dot in the header. Details (where PEPO runs, privacy, and each
 * service) open only on request: telemetry on demand, never a dashboard.
 */
export function StatusIndicator() {
  const status = useSystemStatus()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return
        // This Escape is ours: don't let it also put the workspace away.
        e.stopPropagation()
      }
      if (e instanceof PointerEvent && ref.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('keydown', close, true)
    window.addEventListener('pointerdown', close)
    return () => {
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('pointerdown', close)
    }
  }, [open])

  const healthy = status.connected && status.services.every((s) => s.state !== 'offline')

  return (
    <div className="status" ref={ref}>
      <button className="status-trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="PEPO status">
        <span className={`local-dot ${healthy ? '' : 'is-warn'}`} />
        <span className="hidden sm:inline">{status.local ? 'Local' : 'Remote'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="status-panel surface"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: ease.out }}
          >
            <ul className="status-facts">
              <li>{status.local ? 'Running on this device' : 'Running remotely'}</li>
              <li>{status.private ? 'Private · nothing leaves it' : 'Shares data with a service'}</li>
              <li>{status.connected ? 'Connected' : 'Offline'}</li>
            </ul>
            {status.services.length > 0 && (
              <ul className="status-services">
                {status.services.map((s) => (
                  <li key={s.name}>
                    <span className={`service-dot is-${s.state}`} />
                    <span className="service-name">{s.name}</span>
                    <span className="service-detail">{s.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
