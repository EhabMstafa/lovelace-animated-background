import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CodeXml, Folder, Globe, Image, LayoutGrid, Map as MapIcon, MessagesSquare, NotebookPen, SquareTerminal, type LucideIcon } from 'lucide-react'
import { pepoEvents } from '../core/events'
import { useWorkspace, workspace } from '../core/workspace'
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
  map: { id: 'map', label: 'Maps', icon: MapIcon },
  code: { id: 'code', label: 'Code', icon: CodeXml },
  images: { id: 'images', label: 'Images', icon: Image },
  conversation: { id: 'conversation', label: 'Conversation', icon: MessagesSquare },
}

/** Tools closed recently stay within reach for a while. */
const RECENT_MS = 10 * 60_000
const RECENT_MAX = 2

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

/** Opens a tool, or brings it forward (restoring it if it was put away). */
function openTool(id: string) {
  pepoEvents.emit('toolOpen', { toolId: id })
  const open = workspace.getSnapshot().find((w) => w.kind === id)
  if (open) workspace.focus(open.id)
}

/**
 * An intelligent tool shelf, not a launcher. It carries only what is
 * useful now; everything else sits behind "More".
 */
export function AdaptiveDock({ pinned = ['browser', 'files', 'terminal', 'notes'], relevant: suggested = [] }: AdaptiveDockProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [shelf, setShelf] = useState(false)
  const windows = useWorkspace()
  const openKinds = new Set(windows.map((w) => w.kind as string))
  const awayKinds = new Set(windows.filter((w) => w.minimized).map((w) => w.kind as string))
  // Recently closed tools: kept within reach for a while.
  const [recent, setRecent] = useState<{ id: string; at: number }[]>([])
  useEffect(
    () =>
      pepoEvents.on('toolClose', ({ toolId }) =>
        setRecent((list) => [{ id: toolId, at: Date.now() }, ...list.filter((r) => r.id !== toolId)].slice(0, 6)),
      ),
    [],
  )
  const recentIds = recent.filter((r) => Date.now() - r.at < RECENT_MS && !openKinds.has(r.id)).map((r) => r.id).slice(0, RECENT_MAX)
  // Pinned tools, then whatever is open (or put away), then what was used recently.
  const relevant = [...new Set([...suggested, ...windows.map((w) => w.kind as string), ...recentIds])].filter((id) => !pinned.includes(id) && TOOLS[id])

  useEffect(() => {
    if (!shelf) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== 'Escape') return
        // This Escape is ours: don't let it also put the workspace away.
        e.stopPropagation()
      }
      if (e instanceof PointerEvent && ref.current?.parentElement?.contains(e.target as Node)) return
      setShelf(false)
    }
    window.addEventListener('keydown', close, true)
    window.addEventListener('pointerdown', close)
    return () => {
      window.removeEventListener('keydown', close, true)
      window.removeEventListener('pointerdown', close)
    }
  }, [shelf])

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
        className={`dock-item ${openKinds.has(id) ? 'is-open' : ''} ${awayKinds.has(id) ? 'is-away' : ''}`}
        aria-label={tool.label}
        onPointerEnter={() => setHovered(id)}
        onPointerLeave={() => setHovered((h) => (h === id ? null : h))}
        onFocus={() => setHovered(id)}
        onBlur={() => setHovered(null)}
        onClick={() => openTool(id)}
        initial={transient ? { opacity: 0, scale: 0.6 } : false}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.6 }}
        transition={{ duration: 0.3, ease: ease.out }}
      >
        <span className="dock-icon">
          <Icon size={19} strokeWidth={1.35} />
        </span>
        <Tip show={hovered === id} label={awayKinds.has(id) ? `${tool.label} · put away` : tool.label} />
        {openKinds.has(id) && <span className="dock-relevance" aria-hidden="true" />}
      </motion.button>
    )
  }

  return (
    <div className="dock-wrap">
    <AnimatePresence>
      {shelf && (
        <motion.div
          className="tool-shelf surface"
          role="menu"
          aria-label="All tools"
          initial={{ opacity: 0, y: 8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.22, ease: ease.out }}
        >
          {Object.values(TOOLS).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="menuitem"
              className={openKinds.has(id) ? 'is-open' : ''}
              onClick={() => {
                openTool(id)
                setShelf(false)
              }}
            >
              <Icon size={18} strokeWidth={1.35} />
              <span>{label}</span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
    <motion.div layout ref={ref} className="dock surface" onPointerMove={onMove} role="toolbar" aria-label="Tools">
      {pinned.map((id) => renderTool(id))}
      <AnimatePresence initial={false}>
        {relevant.length > 0 && <motion.span key="divider" layout className="dock-divider" />}
        {relevant.map((id) => renderTool(id, true))}
      </AnimatePresence>
      <span className="dock-divider" />
      <motion.button
        layout
        aria-label="More tools"
        aria-expanded={shelf}
        className={`dock-item ${shelf ? 'is-open' : ''}`}
        onPointerEnter={() => setHovered('more')}
        onPointerLeave={() => setHovered(null)}
        onClick={() => {
          setShelf((v) => !v)
          pepoEvents.emit('workspaceAction', { action: 'openToolLibrary' })
        }}
      >
        <span className="dock-icon">
          <LayoutGrid size={17} strokeWidth={1.35} />
        </span>
        <Tip show={hovered === 'more' && !shelf} label="More" />
      </motion.button>
    </motion.div>
    </div>
  )
}
