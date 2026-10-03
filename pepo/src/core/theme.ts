import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'pepo.theme'
const listeners = new Set<() => void>()
const systemQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'dark' || v === 'light' ? v : null
  } catch {
    return null
  }
}

/** The viewer's choice, else their system's. */
let current: Theme = stored() ?? (systemQuery?.matches ? 'light' : 'dark')

let switching = 0

function apply(animate = false) {
  const root = document.documentElement
  // A ~300 ms cross-fade of colours: no flash, no full-screen fade, nothing else resets.
  if (animate) {
    root.classList.add('theme-switching')
    window.clearTimeout(switching)
    switching = window.setTimeout(() => root.classList.remove('theme-switching'), 380)
  }
  root.dataset.theme = current
  root.style.colorScheme = current
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', current === 'light' ? '#eef3f9' : '#030812')
}

if (typeof document !== 'undefined') apply()

// Follow the system until the viewer picks a theme themselves.
systemQuery?.addEventListener('change', (e) => {
  if (stored()) return
  current = e.matches ? 'light' : 'dark'
  apply(true)
  listeners.forEach((l) => l())
})

export const theme = {
  get: () => current,
  set(next: Theme) {
    if (next === current) return
    current = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage unavailable: the choice lasts this visit only.
    }
    apply(true)
    listeners.forEach((l) => l())
  },
  toggle() {
    theme.set(current === 'dark' ? 'light' : 'dark')
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => listeners.delete(l)
  },
}

export function useTheme() {
  return useSyncExternalStore(theme.subscribe, theme.get)
}
