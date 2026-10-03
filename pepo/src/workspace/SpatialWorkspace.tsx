import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence } from 'framer-motion'
import { CodeXml, Folder, Globe, Image, Map as MapIcon, NotebookPen, SquareTerminal, type LucideIcon } from 'lucide-react'
import { pepoEvents } from '../core/events'
import { presence } from '../core/presence'
import { useWorkspace, workspace, type ToolKind, type WorkspaceWindow } from '../core/workspace'
import { ErrorBoundary } from '../app/ErrorBoundary'
import { FloatingWindow } from './FloatingWindow'
import { computeLayout } from './layout'
import { LightStreams } from './LightStreams'
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
}

const HINTS: Record<ToolKind, string> = {
  map: 'Ask PEPO to find a place or plan a route.',
  notes: 'PEPO will write here as it works.',
  terminal: 'Commands PEPO runs will appear here.',
  browser: 'Ask PEPO to look something up.',
  files: 'Ask PEPO to find a file.',
  code: 'Ask PEPO to open or write code.',
  images: 'Ask PEPO to show or make an image.',
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
  const layout = useMemo(() => computeLayout(windows, w, h), [windows, w, h])

  // Move PEPO's presence (the WebGL stage and its reflection) with the layout.
  useEffect(() => {
    const root = document.documentElement
    const busy = windows.length > 0
    root.style.setProperty('--presence-x', busy ? `${layout.presence.x}px` : '50%')
    root.style.setProperty('--presence-y', busy ? `${layout.presence.y}px` : 'var(--orb-y)')
    root.style.setProperty('--presence-scale', String(layout.presence.scale))
    root.style.setProperty('--caption-x', `${layout.caption.x}px`)
    root.style.setProperty('--caption-y', `${layout.caption.y}px`)
    root.style.setProperty('--caption-w', `${layout.caption.w}px`)
    root.dataset.workspace = busy ? layout.mode : 'empty'
  }, [layout, windows.length])

  // Escape puts the work away (when PEPO isn't listening and nothing is being typed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      if (presence.getSnapshot().state === 'listening') return
      if (workspace.getSnapshot().length) {
        workspace.getSnapshot().forEach((win) => pepoEvents.emit('toolClose', { toolId: win.kind }))
        workspace.closeAll()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const origin = { x: layout.presence.x, y: layout.presence.y }
  const sheet = layout.mode === 'sheet'
  // Phones show one surface at a time: the newest, unless a tab picked another.
  const [front, setFront] = useState<string | null>(null)
  const newest = [...windows].sort((a, b) => b.openedAt - a.openedAt)[0] ?? null
  useEffect(() => setFront(null), [newest?.id])
  const latest = sheet ? windows.find((win) => win.id === front) ?? newest : null
  // Elsewhere, as many as fit; the rest wait in the dock until brought forward.
  const shown = sheet ? (latest ? [latest] : []) : windows.filter((win) => layout.rects[win.id])

  return (
    <div className="workspace" aria-label="Workspace">
      <LightStreams
        origin={origin}
        targets={shown.filter((win) => layout.rects[win.id]).map((win) => ({ id: win.id, rect: layout.rects[win.id], active: win.active, openedAt: win.openedAt }))}
      />
      <AnimatePresence>
        {shown.map((win, i) =>
          layout.rects[win.id] ? (
            <FloatingWindow
              key={win.id}
              rect={layout.rects[win.id]}
              origin={origin}
              title={win.title}
              icon={ICONS[win.kind]}
              active={win.active}
              delay={i === shown.length - 1 ? 0.12 : 0}
              z={win.z}
              onFocus={() => workspace.focus(win.id)}
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
      {sheet && windows.length > 1 && (
        <div className="sheet-tabs" style={{ top: latest ? layout.rects[latest.id].y - 44 : 0 }}>
          {[...windows].sort((a, b) => a.openedAt - b.openedAt).map((win) => {
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
