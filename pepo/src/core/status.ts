import { useSyncExternalStore } from 'react'

export type ServiceState = 'ready' | 'busy' | 'offline'

export interface ServiceStatus {
  name: string
  state: ServiceState
  /** Short human detail, e.g. "Listening" or "Local · 8B". */
  detail: string
}

export interface SystemStatus {
  /** Where PEPO runs. */
  local: boolean
  /** Nothing leaves the device. */
  private: boolean
  connected: boolean
  services: ServiceStatus[]
}

type Listener = () => void

/**
 * Meaningful status, available on demand. PEPO's runtime reports here;
 * the UI shows one quiet dot and opens the details only when asked.
 */
class StatusStore {
  private snapshot: SystemStatus = { local: true, private: true, connected: true, services: [] }
  private listeners = new Set<Listener>()
  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.snapshot
  update(patch: Partial<SystemStatus>) {
    this.snapshot = { ...this.snapshot, ...patch }
    this.listeners.forEach((l) => l())
  }
  setService(name: string, state: ServiceState, detail: string) {
    const services = this.snapshot.services.some((s) => s.name === name)
      ? this.snapshot.services.map((s) => (s.name === name ? { name, state, detail } : s))
      : [...this.snapshot.services, { name, state, detail }]
    const same = this.snapshot.services.find((s) => s.name === name)
    if (same && same.state === state && same.detail === detail) return
    this.update({ services })
  }
}

export const systemStatus = new StatusStore()

export function useSystemStatus() {
  return useSyncExternalStore(systemStatus.subscribe, systemStatus.getSnapshot)
}
