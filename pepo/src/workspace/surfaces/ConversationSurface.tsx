import { useEffect, useRef } from 'react'
import { useConversation } from '../../core/conversation'

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/** Conversation history, opened on demand: your turns, PEPO's, and what it did. */
export function ConversationSurface() {
  const turns = useConversation()
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [turns.length])

  if (turns.length === 0) {
    return (
      <div className="empty-surface">
        <p>Nothing said yet. Talk to PEPO and the conversation will collect here.</p>
      </div>
    )
  }
  return (
    <div className="conversation-surface">
      {turns.map((t) => (
        <div key={t.id} className={`turn turn-${t.who}`}>
          <span className="turn-meta">
            {t.who === 'user' ? 'You' : t.who === 'pepo' ? 'PEPO' : 'Tool'} · {time(t.at)}
          </span>
          <p>{t.text}</p>
        </div>
      ))}
      <div ref={end} />
    </div>
  )
}
