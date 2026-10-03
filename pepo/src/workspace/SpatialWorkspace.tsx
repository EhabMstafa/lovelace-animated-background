import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  BookOpen,
  Brain,
  CalendarDays,
  Clapperboard,
  CodeXml,
  Eye,
  FileText,
  Folder,
  Globe,
  Image,
  ListChecks,
  Map as MapIcon,
  MessagesSquare,
  Music,
  NotebookPen,
  Search,
  Settings2,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react'
import { useDockPrefs } from '../core/dockPrefs'
import { pepoEvents } from '../core/events'
import { presence } from '../core/presence'
import { useWorkspace, workspace, type ToolKind, type WorkspaceWindow } from '../core/workspace'
import { ErrorBoundary } from '../app/ErrorBoundary'
import { FloatingWindow } from './FloatingWindow'
import { computeLayout, type Rect } from './layout'
import { LightStreams } from './LightStreams'
import { BrowserSurface, type BrowserData } from './surfaces/BrowserSurface'
import { CodeSurface, type CodeData } from './surfaces/CodeSurface'
import { ConversationSurface } from './surfaces/ConversationSurface'
import { DocumentSurface, type DocumentData } from './surfaces/DocumentSurface'
import { FilesSurface, type FilesData } from './surfaces/FilesSurface'
import { CalendarSurface, MemorySurface, ResearchSurface, SearchSurface, SettingsSurface, type CalendarData, type MemoryData, type ResearchData, type SearchData } from './surfaces/InfoSurfaces'
import { ImagesSurface, MediaSurface, PreviewSurface, VideoSurface, type ImagesData, type MediaData, type PreviewData, type VideoData } from './surfaces/MediaSurfaces'
import { TasksSurface, type TasksData } from './surfaces/TasksSurface'
import { MapSurface } from './surfaces/MapSurface'
import { EmptySurface, NotesSurface, TerminalSurface } from './surfaces/TextSurfaces'

const ICONS: Record<ToolKind, LucideIcon> = {
  map: MapIcon,
  notes: NotebookPen,
  terminal: SquareTerminal,
  browser: Globe,
  files: Folder,
  code: CodeXml,
  images: Image,
  video: Clapperboard,
  documents: FileText,
  tasks: ListChecks,
  calendar: CalendarDays,
  research: BookOpen,
  search: Search,
  preview: Eye,
  media: Music,
  memory: Brain,
  settings: Settings2,
  conversation: MessagesSquare,
}

const HINTS: Record<ToolKind, string> = {
  map: 'Ask PEPO to find a place or plan a route.',
  notes: 'PEPO will write here as it works.',
  terminal: 'Commands PEPO runs will appear here.',
  browser: 'Ask PEPO to look something up.',
  files: 'Ask PEPO to find a file.',
  code: 'Ask PEPO to open or write code.',
  images: 'Ask PEPO to show or make an image.',
  video: 'Ask PEPO to find a video.',
  calendar: 'Ask PEPO to plan or check your week.',
  research: 'Ask PEPO to look into something.',
  search: '',
  preview: 'Ask PEPO to preview a file.',
  media: 'Ask PEPO to play something.',
  memory: '',
  settings: '',
  documents: 'Ask PEPO to draft or open a document.',
  tasks: 'Ask PEPO to keep track of something.',
  conversation: '',
}

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return size
}

function Surface({ win }: { win: WorkspaceWindow }) {
  const d = win.data
  switch (win.kind) {
    case 'map':
      return <MapSurface progress={(d.progress as number) ?? 0} />
    case 'notes':
      return d.lines ? <NotesSurface title={d.heading as string} lines={d.lines as string[]} writing={win.active} /> : <EmptySurface icon={ICONS.notes} hint={HINTS.notes} />
    case 'terminal':
      return d.lines ? <TerminalSurface lines={d.lines as string[]} writing={win.active} /> : <EmptySurface icon={ICONS.terminal} hint={HINTS.terminal} />
    case 'conversation':
      return <ConversationSurface />
    case 'browser':
      return <BrowserSurface data={d as BrowserData} />
    case 'files':
      return <FilesSurface data={d as FilesData} />
    case 'code':
      return <CodeSurface data={d as CodeData} writing={win.active} />
    case 'documents':
      return <DocumentSurface data={d as DocumentData} />
    case 'images':
      return <ImagesSurface data={d as ImagesData} />
    case 'video':
      return <VideoSurface data={d as VideoData} />
    case 'media':
      return <MediaSurface data={d as MediaData} />
    case 'preview':
      return <PreviewSurface data={d as PreviewData} />
    case 'calendar':
      return <CalendarSurface data={d as CalendarData} />
    case 'research':
      return <ResearchSurface data={d as ResearchData} />
    case 'search':
      return <SearchSurface data={d as SearchData} />
    case 'memory':
      return <MemorySurface data={d as MemoryData} onChange={(facts) => workspace.update(win.id, { data: { facts } })} />
    case 'settings':
      return <SettingsSurface />
    case 'tasks':
      return <TasksSurface data={d as TasksData} onChange={(tasks) => workspace.update(win.id, { data: { tasks } })} />
    default:
      return <EmptySurface icon={ICONS[win.kind]} hint={HINTS[win.kind]} />
  }
}

/** A surface that fails to render shows a quiet note; the rest of PEPO carries on. */
function SurfaceBoundary({ kind, children }: { kind: ToolKind; children: ReactNode }) {
  return (
    <ErrorBoundary label={`surface:${kind}`} fallback={<EmptySurface icon={ICONS[kind]} hint="This surface couldn't load. Close it and open it again." />}>
      {children}
    </ErrorBoundary>
  )
}

/**
 * The near plane's working area. With nothing open it is empty and PEPO
 * sits in the centre. When PEPO acts, it steps aside, surfaces grow out of
 * its light, and the arrangement settles around the task. When the work is
 * put away, PEPO returns to the centre.
 */
export function SpatialWorkspace() {
  const windows = useWorkspace()
  const { w, h } = useViewport()
  const prefs = useDockPrefs()
  // Phones keep the toolbar under the voice control, always shown.
  const dockSide = w <= 640 ? 'bottom' : prefs.side
  const dockHidden = w > 640 && prefs.autoHide
  const layout = useMemo(() => computeLayout(windows, w, h, undefined, { dock: { side: dockSide, hidden: dockHidden } }), [windows, w, h, dockSide, dockHidden])

  // Move PEPO's presence (the WebGL stage and its reflection) with the layout.
  const visible = windows.filter((win) => !win.minimized)
  useEffect(() => {
    const root = document.documentElement
    const busy = visible.length > 0
    root.style.setProperty('--presence-x', busy ? `${layout.presence.x}px` : '50%')
    root.style.setProperty('--presence-y', busy ? `${layout.presence.y}px` : 'var(--orb-y)')
    root.style.setProperty('--presence-scale', String(layout.presence.scale))
    root.style.setProperty('--caption-x', `${layout.caption.x}px`)
    root.style.setProperty('--caption-y', `${layout.caption.y}px`)
    root.style.setProperty('--caption-w', `${layout.caption.w}px`)
    // The voice control sits on the toolbar's row: in PEPO's column while it
    // works aside, else in the middle, next to a bottom toolbar on wide
    // screens (a "row"), above it on narrow ones (a "stack").
    const side = busy && layout.voice
    // A hidden bottom toolbar still keeps its place on the row, so it never
    // appears over the voice control.
    const bottomBar = dockSide === 'bottom'
    const voiceMode = w <= 640 ? 'stack' : side ? 'side' : !bottomBar ? 'centre' : !busy && w >= 900 ? 'row' : 'stack'
    root.style.setProperty('--voice-x', side ? `${layout.voice!.x}px` : '50%')
    root.style.setProperty('--voice-w', side ? `${layout.voice!.w}px` : 'min(560px, 86vw)')
    root.style.setProperty('--dock-x', busy ? `${layout.dock.x}px` : '50%')
    root.dataset.voice = voiceMode
    root.dataset.dock = dockSide
    root.dataset.dockHide = String(dockHidden)
    root.dataset.workspace = busy ? layout.mode : 'empty'
  }, [layout, visible.length, w, dockSide, dockHidden])

  // Escape puts the work away into the dock (when PEPO isn't listening and
  // nothing is being typed). Nothing is closed: the arrangement comes back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      if (presence.getSnapshot().state === 'listening') return
      workspace.minimizeAll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Navigation that only concerns the workspace.
  useEffect(
    () =>
      pepoEvents.on('navigate', ({ destination }) => {
        if (destination === 'home') workspace.minimizeAll()
        else if (destination === 'workspace') workspace.restoreAll()
        else if (destination === 'conversations') workspace.open('conversation', 'Conversation')
        else if (['tasks', 'files', 'memory', 'settings'].includes(destination)) pepoEvents.emit('toolOpen', { toolId: destination })
        else if (destination === 'tools') pepoEvents.emit('workspaceAction', { action: 'showToolShelf' })
      }),
    [],
  )

  // Tell PEPO where a new surface appeared (the Avatar glances toward it).
  const seen = useRef(new Set<string>())
  useEffect(() => {
    for (const win of visible) {
      const r = layout.rects[win.id]
      if (!r || seen.current.has(win.id)) continue
      seen.current.add(win.id)
      const vx = r.x + r.w / 2 - layout.presence.x
      const vy = layout.presence.y - (r.y + r.h / 2)
      const m = Math.max(Math.abs(vx), Math.abs(vy), 1)
      pepoEvents.emit('surfaceShown', { id: win.id, dx: vx / m, dy: vy / m })
    }
    for (const id of seen.current) if (!windows.some((w) => w.id === id)) seen.current.delete(id)
  }, [visible, layout, windows])

  // Surfaces put away keep the place they had, so they shrink into the dock from there.
  const lastRects = useRef<Record<string, Rect>>({})
  for (const id in layout.rects) lastRects.current[id] = layout.rects[id]

  const origin = { x: layout.presence.x, y: layout.presence.y }
  const sheet = layout.mode === 'sheet'
  // Phones show one surface at a time: the newest, unless a tab picked another.
  const [front, setFront] = useState<string | null>(null)
  const newest = [...visible].sort((a, b) => b.openedAt - a.openedAt)[0] ?? null
  useEffect(() => setFront(null), [newest?.id])
  const latest = sheet ? visible.find((win) => win.id === front) ?? newest : null
  // Elsewhere, as many as fit; the rest wait in the dock until brought forward.
  const shown = sheet ? (latest ? [latest] : []) : visible.filter((win) => layout.rects[win.id])
  // Put-away surfaces stay mounted (shrunk into the dock) so they can grow back.
  const away = sheet ? [] : windows.filter((win) => win.minimized && lastRects.current[win.id])
  const topZ = Math.max(0, ...shown.map((win) => win.z))

  return (
    <div className="workspace" aria-label="Workspace">
      <LightStreams
        origin={origin}
        targets={shown.filter((win) => layout.rects[win.id]).map((win) => ({ id: win.id, rect: layout.rects[win.id], active: win.active, openedAt: win.openedAt }))}
      />
      <AnimatePresence>
        {[...shown, ...away].map((win, i) =>
          layout.rects[win.id] || win.minimized ? (
            <FloatingWindow
              key={win.id}
              rect={layout.rects[win.id] ?? lastRects.current[win.id]}
              origin={origin}
              title={win.title}
              icon={ICONS[win.kind]}
              active={win.active}
              inactive={!win.minimized && shown.length > 1 && win.z !== topZ}
              front={!win.minimized && shown.length > 1 && win.z === topZ}
              minimized={win.minimized}
              delay={i === shown.length - 1 ? 0.08 : 0}
              z={win.z}
              onFocus={() => workspace.focus(win.id)}
              onMinimize={() => workspace.minimize(win.id)}
              onPlace={(rect) => workspace.place(win.id, rect)}
              onClose={() => {
                pepoEvents.emit('toolClose', { toolId: win.kind })
                workspace.close(win.id)
              }}
            >
              <SurfaceBoundary kind={win.kind}>
                <Surface win={win} />
              </SurfaceBoundary>
            </FloatingWindow>
          ) : null,
        )}
      </AnimatePresence>
      {sheet && visible.length > 1 && (
        <div className="sheet-tabs" style={{ top: latest ? layout.rects[latest.id].y - 44 : 0 }}>
          {[...visible].sort((a, b) => a.openedAt - b.openedAt).map((win) => {
            const Icon = ICONS[win.kind]
            return (
              <button
                key={win.id}
                className={win.id === latest?.id ? 'is-active' : ''}
                onClick={() => setFront(win.id)}
                aria-label={win.title}
              >
                <Icon size={14} strokeWidth={1.5} />
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
