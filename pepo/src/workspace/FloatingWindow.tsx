import { useState, type ReactNode } from 'react'
import { motion, useDragControls } from 'framer-motion'
import { X, type LucideIcon } from 'lucide-react'
import { ease } from '../core/tokens'
import type { Rect } from './layout'

interface FloatingWindowProps {
  rect: Rect
  /** Where PEPO is: surfaces grow out of, and collapse back toward, its light. */
  origin: { x: number; y: number }
  title: string
  icon: LucideIcon
  active: boolean
  delay?: number
  onClose: () => void
  children: ReactNode
}

/**
 * A surface PEPO places on the workspace. Soft radius, hairline border,
 * a whisper of glass. No title bar chrome: a small label, a quiet close,
 * and the header as a drag handle.
 */
export function FloatingWindow({ rect, origin, title, icon: Icon, active, delay = 0, onClose, children }: FloatingWindowProps) {
  const drag = useDragControls()
  const [dragging, setDragging] = useState(false)
  // The surface grows from the point nearest PEPO.
  const ox = Math.max(0, Math.min(100, ((origin.x - rect.x) / rect.w) * 100))
  const oy = Math.max(0, Math.min(100, ((origin.y - rect.y) / rect.h) * 100))

  return (
    <motion.section
      className={`floating-window surface ${active ? 'is-active' : ''} ${dragging ? 'is-dragging' : ''}`}
      style={{ transformOrigin: `${ox}% ${oy}%` }}
      initial={{ opacity: 0, scale: 0.4, filter: 'blur(12px)', left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      exit={{ opacity: 0, scale: 0.45, filter: 'blur(10px)', transition: { duration: 0.34, ease: ease.inOut } }}
      transition={{
        opacity: { duration: 0.4, delay },
        scale: { duration: 0.45, ease: ease.out, delay },
        filter: { duration: 0.45, delay },
        default: { duration: 0.6, ease: ease.out },
      }}
      drag
      dragControls={drag}
      dragListener={false}
      dragMomentum={false}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      aria-label={title}
    >
      <header className="window-header" onPointerDown={(e) => drag.start(e)}>
        <Icon size={13} strokeWidth={1.5} />
        <span className="window-title">{title}</span>
        {active && <span className="window-activity" aria-label="PEPO is working here" />}
        <button className="window-close" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label={`Close ${title}`}>
          <X size={13} strokeWidth={1.6} />
        </button>
      </header>
      <div className="window-body">{children}</div>
    </motion.section>
  )
}
