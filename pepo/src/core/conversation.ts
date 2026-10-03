import { useSyncExternalStore } from 'react'

export interface Turn {
  id: number
  who: 'user' | 'pepo' | 'tool'
  text: string
  at: number
}

/**
 * Conversation history: what was said and what PEPO did. It is not the main
 * surface (voice stays lightweight and the transcript temporary); it is kept
 * here so it can be opened on demand.
 */
class ConversationStore {
  private turns: Turn[] = []
  private seq = 0
  private listeners = new Set<() => void>()

  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  getSnapshot = () => this.turns

  add(who: Turn['who'], text: string) {
    const last = this.turns[this.turns.length - 1]
    if (last && last.who === who && last.text === text) return
    this.turns = [...this.turns, { id: ++this.seq, who, text, at: Date.now() }].slice(-200)
    this.listeners.forEach((l) => l())
  }
  clear() {
    this.turns = []
    this.listeners.forEach((l) => l())
  }
}

export const conversation = new ConversationStore()

export function useConversation() {
  return useSyncExternalStore(conversation.subscribe, conversation.getSnapshot)
}
