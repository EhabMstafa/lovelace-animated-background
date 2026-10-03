import { useSyncExternalStore } from 'react'

export type DockSide = 'bottom' | 'left' | 'right'
export interface DockPrefs {
  /** Where the toolbar sits. */
  side: DockSide
  /** Hidden until the pointer reaches its edge (or keyboard focus does). */
  autoHide: boolean
}

const STORAGE_KEY = 'pepo.dock'
const DEFAULTS: DockPrefs = { side: 'bottom', autoHide: false }
const listeners = new Set<() => void>()

function stored(): DockPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (v && ['bottom', 'left', 'right'].includes(v.side)) return { side: v.side, autoHide: !!v.autoHide }
  } catch {
    // Unreadable or unavailable: the defaults.
  }
  return DEFAULTS
}

let current: DockPrefs = typeof window !== 'undefined' ? stored() : DEFAULTS

/** The toolbar's place and behaviour, chosen in Settings. Kept on this device. */
export const dockPrefs = {
  get: () => current,
  set(patch: Partial<DockPrefs>) {
    const next = { ...current, ...patch }
    if (next.side === current.side && next.autoHide === current.autoHide) return
    current = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage unavailable: the choice lasts this visit only.
    }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useDockPrefs() {
  return useSyncExternalStore(dockPrefs.subscribe, dockPrefs.get)
}
