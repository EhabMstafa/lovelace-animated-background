import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CodeXml, Folder, Globe, Image, LayoutGrid, Map as MapIcon, NotebookPen, SquareTerminal, type LucideIcon } from 'lucide-react'
import { pepoEvents } from '../core/events'
import { ease } from '../core/tokens'

export interface DockTool {
  id: string
  label: string
  icon: LucideIcon
}

export const TOOLS: Record<string, DockTool> = {
  browser: { id: 'browser', label: 'Browser', icon: Globe },
  files: { id: 'files', label: 'Files', icon: Folder },
  terminal: { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  notes: { id: 'notes', label: 'Notes', icon: NotebookPen },
  maps: { id: 'maps', label: 'Maps', icon: MapIcon },
  code: { id: 'code', label: 'Code', icon: CodeXml },
  images: { id: 'images', label: 'Images', icon: Image },
}

function Tip({ show, label }: { show: boolean; label: string }) {
  return (
    <span className="dock-tip-anchor" aria-hidden="true">
      <AnimatePresence>
        {show && (
          <motion.span
            className="dock-tip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.16 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

interface AdaptiveDockProps {
  /** Always-present tools. */
  pinned?: string[]
  /** Tools PEPO considers relevant right now; they slide in after a divider. */
  relevant?: string[]
}

/**
 * An intelligent tool shelf, not a launcher. It carries only what is
 * useful now; everything else sits behind "More".
 */
export function AdaptiveDock({ pinned = ['browser', 'files', 'terminal', 'notes'], relevant = [] }: AdaptiveDockProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--lx', `${e.clientX - rect.left}px`)
  }

  const renderTool = (id: string, transient = false) => {
    const tool = TOOLS[id]
    if (!tool) return null
    const Icon = tool.icon
    return (
      <motion.button
        key={id}
        layout
        className="dock-item"
        aria-label={tool.label}
        onPointerEnter={() => setHovered(id)}
        onPointerLeave={() => setHovered((h) => (h === id ? null : h))}
        onFocus={() => setHovered(id)}
        onBlur={() => setHovered(null)}
        onClick={() => pepoEvents.emit('toolOpen', { toolId: id })}
        initial={transient ? { opacity: 0, scale: 0.6 } : false}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.6 }}
        transition={{ duration: 0.3, ease: ease.out }}
      >
        <span className="dock-icon">
          <Icon size={19} strokeWidth={1.35} />
        </span>
        <Tip show={hovered === id} label={tool.label} />
        {transient && <span className="dock-relevance" aria-hidden="true" />}
      </motion.button>
    )
  }

  return (
    <motion.div layout ref={ref} className="dock surface" onPointerMove={onMove} role="toolbar" aria-label="Tools">
      {pinned.map((id) => renderTool(id))}
      <AnimatePresence initial={false}>
        {relevant.length > 0 && <motion.span key="divider" layout className="dock-divider" />}
        {relevant.map((id) => renderTool(id, true))}
      </AnimatePresence>
      <span className="dock-divider" />
      <motion.button
        layout
        className="dock-item"
        aria-label="More tools"
        onPointerEnter={() => setHovered('more')}
        onPointerLeave={() => setHovered(null)}
        onClick={() => pepoEvents.emit('workspaceAction', { action: 'openToolLibrary' })}
      >
        <span className="dock-icon">
          <LayoutGrid size={17} strokeWidth={1.35} />
        </span>
        <Tip show={hovered === 'more'} label="More" />
      </motion.button>
    </motion.div>
  )
}
