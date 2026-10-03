import type { PresenceState } from './presence'

/**
 * Integration surface between the visual layer and PEPO's runtime.
 *
 * The UI emits *intents* (the user pressed the mic, opened a tool…).
 * The runtime answers by driving `presence` (see presence.ts). Nothing in
 * the visual layer assumes how speech, tools or models are implemented.
 */
export interface PEPOEventMap {
  voiceStart: void
  voiceStop: void
  textSubmit: { text: string }
  toolOpen: { toolId: string }
  toolClose: { toolId: string }
  navigate: { destination: string }
  presenceChange: { from: PresenceState; to: PresenceState }
  workspaceAction: { action: string; payload?: unknown }
}

type Handler<T> = (payload: T) => void

class EventBus {
  private handlers = new Map<keyof PEPOEventMap, Set<Handler<never>>>()

  on<K extends keyof PEPOEventMap>(event: K, handler: Handler<PEPOEventMap[K]>) {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler as Handler<never>)
    return () => set!.delete(handler as Handler<never>)
  }

  emit<K extends keyof PEPOEventMap>(
    event: K,
    ...payload: PEPOEventMap[K] extends void ? [] : [PEPOEventMap[K]]
  ) {
    this.handlers.get(event)?.forEach((h) => (h as Handler<unknown>)(payload[0]))
  }
}

export const pepoEvents = new EventBus()
