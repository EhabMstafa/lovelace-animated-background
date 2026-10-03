import { useSyncExternalStore } from 'react'

/** Tools PEPO can place on the workspace. */
export type ToolKind = 'map' | 'notes' | 'terminal' | 'browser' | 'files' | 'code' | 'images'

export interface WorkspaceWindow {
  id: string
  kind: ToolKind
  title: string
  openedAt: number
  /** Stacking order: the most recently focused surface is in front. */
  z: number
  /** True while PEPO is writing into this surface (light flows toward it). */
  active: boolean
  /** Surface content, owned by whoever drives the tool (the runtime). */
  data: Record<string, unknown>
}

type Listener = () => void

/**
 * The spatial workspace: which surfaces exist, and what is in them.
 * Like `presence`, it is framework-agnostic so PEPO's runtime can open,
 * fill and close tools from anywhere. The UI only renders it.
 */
class WorkspaceStore {
  private windows: WorkspaceWindow[] = []
  private listeners = new Set<Listener>()
  private seq = 0
  private zSeq = 0

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.windows
  private set(next: WorkspaceWindow[]) {
    this.windows = next
    this.listeners.forEach((l) => l())
  }

  /** Opens a tool, or returns the existing one of that kind. */
  open(kind: ToolKind, title: string, data: Record<string, unknown> = {}) {
    const existing = this.windows.find((w) => w.kind === kind)
    if (existing) {
      this.focus(existing.id)
      return existing.id
    }
    const id = `${kind}-${++this.seq}`
    this.set([...this.windows, { id, kind, title, openedAt: performance.now(), z: ++this.zSeq, active: false, data }])
    return id
  }
  /** Brings a surface to the front. */
  focus(id: string) {
    const win = this.windows.find((w) => w.id === id)
    if (!win || win.z === this.zSeq) return
    const z = ++this.zSeq
    this.set(this.windows.map((w) => (w.id === id ? { ...w, z } : w)))
  }
  update(id: string, patch: Partial<Pick<WorkspaceWindow, 'title' | 'active'>> & { data?: Record<string, unknown> }) {
    this.set(
      this.windows.map((w) =>
        w.id === id ? { ...w, ...patch, data: patch.data ? { ...w.data, ...patch.data } : w.data } : w,
      ),
    )
  }
  close(id: string) {
    this.set(this.windows.filter((w) => w.id !== id))
  }
  closeAll() {
    this.set([])
  }
  find(kind: ToolKind) {
    return this.windows.find((w) => w.kind === kind)
  }
}

export const workspace = new WorkspaceStore()

export function useWorkspace() {
  return useSyncExternalStore(workspace.subscribe, workspace.getSnapshot)
}
