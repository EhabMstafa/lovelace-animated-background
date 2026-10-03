import { useSyncExternalStore } from 'react'

/**
 * The seven states of PEPO's presence. The visual layer only *renders*
 * these; deciding which one is active belongs to PEPO's runtime.
 */
export type PresenceState =
  | 'idle'
  | 'listening'
  | 'understanding'
  | 'thinking'
  | 'speaking'
  | 'working'
  | 'waiting'

export const PRESENCE_STATES: readonly PresenceState[] = [
  'idle',
  'listening',
  'understanding',
  'thinking',
  'speaking',
  'working',
  'waiting',
]

/** Which body PEPO currently inhabits. Only `orb` exists in Scene 1. */
export type PresenceForm = 'orb' | 'avatar'

export interface PresenceSnapshot {
  state: PresenceState
  form: PresenceForm
  /** Live input or output energy, 0..1 (mic amplitude or speech energy). */
  energy: number
  /** Short line PEPO says under the Orb, or null for silence. */
  caption: string | null
  /** Rolling transcription of what the user is saying. */
  transcript: string | null
}

type Listener = () => void

/**
 * Minimal external store. Deliberately framework-agnostic so PEPO's real
 * runtime can drive it from anywhere (WebSocket handler, IPC bridge…).
 *
 * `energy` changes at audio rate, so it is kept off the React snapshot and
 * read imperatively by the render loop via `getEnergy()` to avoid
 * re-rendering the tree 60 times a second.
 */
class PresenceStore {
  private snapshot: PresenceSnapshot = {
    state: 'idle',
    form: 'orb',
    energy: 0,
    caption: null,
    transcript: null,
  }
  private energy = 0
  private listeners = new Set<Listener>()

  subscribe = (listener: Listener) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  getEnergy = () => this.energy

  setEnergy(value: number) {
    this.energy = Math.max(0, Math.min(1, value))
  }

  update(patch: Partial<Omit<PresenceSnapshot, 'energy'>>) {
    const next = { ...this.snapshot, ...patch }
    if (
      next.state === this.snapshot.state &&
      next.form === this.snapshot.form &&
      next.caption === this.snapshot.caption &&
      next.transcript === this.snapshot.transcript
    ) {
      return
    }
    this.snapshot = next
    this.listeners.forEach((l) => l())
  }
}

export const presence = new PresenceStore()

export function usePresence(): PresenceSnapshot {
  return useSyncExternalStore(presence.subscribe, presence.getSnapshot)
}
