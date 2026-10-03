import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpen,
  Brain,
  House,
  PanelsTopLeft,
  Settings2,
  CalendarDays,
  Clapperboard,
  CodeXml,
  Eye,
  FileText,
  Folder,
  Globe,
  Image,
  LayoutGrid,
  ListChecks,
  Map as MapIcon,
  MessagesSquare,
  Music,
  NotebookPen,
  Search,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react'
import { useDockPrefs } from '../core/dockPrefs'
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
  video: { id: 'video', label: 'Video', icon: Clapperboard },
  documents: { id: 'documents', label: 'Documents', icon: FileText },
  tasks: { id: 'tasks', label: 'Tasks', icon: ListChecks },
  calendar: { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  research: { id: 'research', label: 'Research', icon: BookOpen },
  search: { id: 'search', label: 'Search', icon: Search },
  preview: { id: 'preview', label: 'Preview', icon: Eye },
  media: { id: 'media', label: 'Media', icon: Music },
  conversation: { id: 'conversation', label: 'Conversation', icon: MessagesSquare },
}

/** Places (what the navigation rail used to hold), at the start of the toolbar. */
const PLACES: (DockTool & { kind?: string })[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'workspace', label: 'Workspace', icon: PanelsTopLeft },
  { id: 'conversations', label: 'Conversations', icon: MessagesSquare, kind: 'conversation' },
  { id: 'memory', label: 'Memory', icon: Brain, kind: 'memory' },
]
const SETTINGS: DockTool & { kind: string } = { id: 'settings', label: 'Settings', icon: Settings2, kind: 'settings' }
/** Kinds the places already open; they don't repeat among the tools. */
const PLACE_KINDS = new Set(['conversation', 'memory', 'settings'])

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
  /** Phones: only the tool shelf button (voice stays the main way in). */
  compact?: boolean
}

/** Opens a tool, or brings it forward (restoring it if it was put away). */
function openTool(id: string) {
  pepoEvents.emit('toolOpen', { toolId: id })
  const open = workspace.getSnapshot().find((w) => w.kind === id)
  if (open) workspace.focus(open.id)
}

const go = (destination: string) => pepoEvents.emit('navigate', { destination })

/**
 * PEPO's one toolbar: places (home, workspace, conversations, memory), then
 * an intelligent tool shelf, not a launcher (only what is useful now;
 * everything else sits behind "More"), then settings. It sits at the bottom,
 * left or right, and can hide until the pointer reaches its edge (Settings).
 */
export function AdaptiveDock({ pinned: pinnedTools = ['browser', 'files', 'terminal', 'notes'], relevant: suggested = [], compact = false }: AdaptiveDockProps) {
  const pinned = compact ? [] : pinnedTools
  const prefs = useDockPrefs()
  // Phones keep it under the voice control, always shown.
  const side = compact ? 'bottom' : prefs.side
  const autoHide = !compact && prefs.autoHide
  const vertical = side !== 'bottom'
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
  const relevant = compact ? [] : [...new Set([...suggested, ...windows.map((w) => w.kind as string), ...recentIds])].filter((id) => !pinned.includes(id) && !PLACE_KINDS.has(id) && TOOLS[id])

  // Auto-hide: shown while the pointer is at its edge or on it, while it has
  // keyboard focus, and while the shelf is open.
  const [revealed, setRevealed] = useState(false)
  const hideTimer = useRef(0)
  const reveal = () => {
    window.clearTimeout(hideTimer.current)
    setRevealed(true)
  }
  const conceal = () => {
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setRevealed(false), 700)
  }
  useEffect(() => () => window.clearTimeout(hideTimer.current), [])
  const hidden = autoHide && !revealed && !shelf
  useEffect(() => {
    document.documentElement.dataset.dockShown = String(!hidden)
  }, [hidden])

  // Its size, for placing the voice control beside it (CSS variables, no re-render).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const ro = new ResizeObserver(() => {
      root.style.setProperty('--dock-w', `${el.offsetWidth}px`)
      root.style.setProperty('--dock-h', `${el.offsetHeight}px`)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // "Tools" in the navigation opens the shelf.
  useEffect(
    () =>
      pepoEvents.on('workspaceAction', ({ action }) => {
        if (action === 'showToolShelf') setShelf(true)
      }),
    [],
  )

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
    el.style.setProperty('--ly', `${e.clientY - rect.top}px`)
  }

  const renderPlace = (place: DockTool & { kind?: string }) => {
    const Icon = place.icon
    const isOpen = !!place.kind && openKinds.has(place.kind)
    return (
      <motion.button
        key={place.id}
        layout
        className={`dock-item is-place ${isOpen ? 'is-open' : ''}`}
        aria-label={place.label}
        onPointerEnter={() => setHovered(place.id)}
        onPointerLeave={() => setHovered((h) => (h === place.id ? null : h))}
        onFocus={() => setHovered(place.id)}
        onBlur={() => setHovered(null)}
        onClick={() => go(place.id)}
      >
        <span className="dock-icon">
          <Icon size={18} strokeWidth={1.35} />
        </span>
        <Tip show={hovered === place.id} label={place.label} />
        {isOpen && <span className="dock-relevance" aria-hidden="true" />}
      </motion.button>
    )
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
    <>
    {autoHide && (
      <div className={`dock-sensor is-${side} ${revealed ? 'is-revealed' : ''}`} aria-hidden="true" onPointerEnter={reveal} />
    )}
    <div
      className={`dock-wrap is-${side} ${vertical ? 'is-vertical' : ''} ${compact ? 'is-compact' : ''} ${hidden ? 'is-hidden' : ''}`}
      onPointerEnter={autoHide ? reveal : undefined}
      onPointerLeave={autoHide ? conceal : undefined}
      onFocus={autoHide ? reveal : undefined}
      onBlur={
        autoHide
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) conceal()
            }
          : undefined
      }
    >
    <AnimatePresence>
      {shelf && (
        <motion.div
          className="tool-shelf surface"
          role="menu"
          aria-label="All tools"
          initial={{ opacity: 0, [vertical ? 'x' : 'y']: side === 'right' ? -8 : 8, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.22, ease: ease.out }}
        >
          {/* Phones have no room for places on the toolbar: they head the shelf. */}
          {compact &&
            [...PLACES, SETTINGS].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="menuitem"
                onClick={() => {
                  go(id)
                  setShelf(false)
                }}
              >
                <Icon size={18} strokeWidth={1.35} />
                <span>{label}</span>
              </button>
            ))}
          {compact && <span className="shelf-divider" aria-hidden="true" />}
          {Object.values(TOOLS).filter(({ id }) => !PLACE_KINDS.has(id)).map(({ id, label, icon: Icon }) => (
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
    <motion.div
      layout
      ref={ref}
      className="dock surface"
      onPointerMove={onMove}
      role="toolbar"
      aria-label="PEPO"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
    >
      {!compact && PLACES.map(renderPlace)}
      {!compact && <span className="dock-divider" />}
      {pinned.map((id) => renderTool(id))}
      <AnimatePresence initial={false}>
        {relevant.length > 0 && <motion.span key="divider" layout className="dock-divider" />}
        {relevant.map((id) => renderTool(id, true))}
      </AnimatePresence>
      {!compact && <span className="dock-divider" />}
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
      {!compact && renderPlace(SETTINGS)}
    </motion.div>
    </div>
    </>
  )
}
