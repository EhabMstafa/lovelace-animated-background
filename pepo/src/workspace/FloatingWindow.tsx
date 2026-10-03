import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useDragControls, useMotionValue } from 'framer-motion'
import { Minus, X, type LucideIcon } from 'lucide-react'
import { ease } from '../core/tokens'
import type { Rect } from './layout'

const MIN_W = 260
const MIN_H = 160

interface FloatingWindowProps {
  rect: Rect
  /** Where PEPO is: surfaces grow out of its light. */
  origin: { x: number; y: number }
  title: string
  icon: LucideIcon
  active: boolean
  /** Not the surface in front: very slightly quieter. */
  inactive: boolean
  /** The surface in focus (only marked when several are shown). */
  front: boolean
  /** Put away in the dock: shrinks toward it, and grows back from it. */
  minimized: boolean
  delay?: number
  z: number
  onFocus: () => void
  onClose: () => void
  onMinimize: () => void
  /** The user moved or resized it (null: hand it back to PEPO's arrangement). */
  onPlace: (rect: Rect | null) => void
  children: ReactNode
}

/**
 * A surface PEPO places on the workspace. Soft radius, hairline border,
 * restrained glass. No OS chrome: a small label, quiet minimise and close,
 * the header as a drag handle (double-click to hand it back to PEPO's
 * arrangement) and a corner to resize. Where the user puts it, it stays.
 */
export function FloatingWindow({
  rect,
  origin,
  title,
  icon: Icon,
  active,
  inactive,
  front,
  minimized,
  delay = 0,
  z,
  onFocus,
  onClose,
  onMinimize,
  onPlace,
  children,
}: FloatingWindowProps) {
  const drag = useDragControls()
  const [dragging, setDragging] = useState(false)
  const dx = useMotionValue(0)
  const dy = useMotionValue(0)
  // Live size while resizing; the placement is committed on release.
  const [live, setLive] = useState<Rect | null>(null)
  // After a drag or resize the new rect is applied instantly (no glide back).
  const [instant, setInstant] = useState(false)
  const pendingReset = useRef(false)

  useLayoutEffect(() => {
    if (!pendingReset.current) return
    pendingReset.current = false
    dx.set(0)
    dy.set(0)
    const id = requestAnimationFrame(() => setInstant(false))
    return () => cancelAnimationFrame(id)
  }, [rect.x, rect.y, rect.w, rect.h, dx, dy])

  // Restoring grows from the dock, like minimising shrinks into it.
  const [fromDock, setFromDock] = useState(false)
  const wasMinimized = useRef(minimized)
  useEffect(() => {
    if (wasMinimized.current && !minimized) {
      setFromDock(true)
      const id = window.setTimeout(() => setFromDock(false), 400)
      wasMinimized.current = minimized
      return () => window.clearTimeout(id)
    }
    wasMinimized.current = minimized
  }, [minimized])

  const r = live ?? rect
  const W = typeof window === 'undefined' ? 1440 : window.innerWidth
  const H = typeof window === 'undefined' ? 900 : window.innerHeight
  const toDock = minimized || fromDock
  const target = toDock ? { x: W / 2, y: H - 40 } : origin
  const ox = Math.max(-200, Math.min(300, ((target.x - r.x) / r.w) * 100))
  const oy = Math.max(-200, Math.min(300, ((target.y - r.y) / r.h) * 100))

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const start = { x: e.clientX, y: e.clientY }
    const base = { ...rect, x: rect.x + dx.get(), y: rect.y + dy.get() }
    let next = base
    setInstant(true)
    const move = (ev: PointerEvent) => {
      next = {
        ...base,
        w: Math.max(MIN_W, Math.min(W - base.x - 8, base.w + ev.clientX - start.x)),
        h: Math.max(MIN_H, Math.min(H - base.y - 60, base.h + ev.clientY - start.y)),
      }
      setLive(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      pendingReset.current = true
      setLive(null)
      onPlace(next)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <motion.section
      className={`floating-window surface ${active ? 'is-active' : ''} ${dragging ? 'is-dragging' : ''} ${inactive ? 'is-inactive' : ''} ${front ? 'is-front' : ''}`}
      style={{ transformOrigin: `${ox}% ${oy}%`, zIndex: z, x: dx, y: dy, pointerEvents: minimized ? 'none' : undefined }}
      onPointerDownCapture={onFocus}
      // Entering the task: fade in, scale 0.98 → 1 and settle a few pixels.
      // Leaving: a simple fade. Minimising shrinks it into the dock.
      initial={{ opacity: 0, scale: 0.98, left: r.x, top: r.y + 10, width: r.w, height: r.h }}
      animate={{ opacity: minimized ? 0 : 1, scale: minimized ? 0.12 : 1, left: r.x, top: r.y, width: r.w, height: r.h }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2, ease: ease.inOut } }}
      transition={{
        opacity: { duration: minimized ? 0.26 : 0.28, delay: minimized ? 0 : delay },
        scale: { duration: minimized ? 0.3 : 0.32, ease: ease.out, delay: minimized ? 0 : delay },
        default: instant ? { duration: 0 } : { duration: 0.4, ease: ease.out },
      }}
      drag={!minimized}
      dragControls={drag}
      dragListener={false}
      dragMomentum={false}
      dragConstraints={{ left: -r.x + 8, top: -r.y + 56, right: W - r.x - r.w - 8, bottom: H - r.y - 60 }}
      dragElastic={0.04}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false)
        setInstant(true)
        pendingReset.current = true
        onPlace({ x: rect.x + dx.get(), y: rect.y + dy.get(), w: rect.w, h: rect.h })
      }}
      aria-label={title}
      aria-hidden={minimized || undefined}
    >
      <header
        className="window-header"
        onPointerDown={(e) => drag.start(e)}
        onDoubleClick={() => onPlace(null)}
        title="Drag to move · double-click to let PEPO arrange it"
      >
        <Icon size={13} strokeWidth={1.5} />
        <span className="window-title">{title}</span>
        {active && <span className="window-activity" aria-label="PEPO is working here" />}
        <span className="window-actions">
          <button className="window-action is-minimise" onClick={onMinimize} onPointerDown={(e) => e.stopPropagation()} aria-label={`Minimise ${title}`}>
            <Minus size={13} strokeWidth={1.6} />
          </button>
          <button className="window-action" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label={`Close ${title}`}>
            <X size={13} strokeWidth={1.6} />
          </button>
        </span>
      </header>
      <div className="window-body">{children}</div>
      <span className="window-resize" onPointerDown={startResize} aria-hidden="true" />
    </motion.section>
  )
}
