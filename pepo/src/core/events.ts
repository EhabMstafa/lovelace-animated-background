import type { PresenceForm, PresenceState } from './presence'

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
  /** The user opened (or closed) the keyboard input: they are about to address PEPO. */
  inputFocus: { active: boolean }
  toolOpen: { toolId: string }
  toolClose: { toolId: string }
  navigate: { destination: string }
  presenceChange: { from: PresenceState; to: PresenceState }
  /** The viewer chose which body PEPO wears. */
  formChange: { form: PresenceForm }
  /**
   * Meaning the runtime attaches to what PEPO is saying (a question, an
   * emphasis, agreement…). The Avatar answers with a restrained gesture;
   * head motion never follows the loudness of the voice.
   */
  cue: {
    kind:
      | 'nod'
      | 'agree'
      | 'strongAgree'
      | 'question'
      | 'emphasis'
      | 'consider'
      | 'conclude'
      | 'lookLeft'
      | 'lookRight'
      | 'understand'
      | 'interest'
      | 'surprise'
      | 'empathy'
  }
  /** A surface appeared on the workspace; dx, dy: its direction from PEPO (-1..1, y up). */
  surfaceShown: { id: string; dx: number; dy: number }
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
    return () => {
      set!.delete(handler as Handler<never>)
    }
  }

  emit<K extends keyof PEPOEventMap>(
    event: K,
    ...payload: PEPOEventMap[K] extends void ? [] : [PEPOEventMap[K]]
  ) {
    this.handlers.get(event)?.forEach((h) => (h as Handler<unknown>)(payload[0]))
  }
}

export const pepoEvents = new EventBus()
