import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Itinerary notes, written line by line as PEPO plans. */
export function NotesSurface({ title, lines = [], writing }: { title?: string; lines?: string[]; writing: boolean }) {
  return (
    <div className="notes-surface">
      {title && <h3>{title}</h3>}
      <ul>
        {lines.map((line, i) => {
          const [head, ...rest] = line.split(' — ')
          return (
            <li key={i} className={rest.length ? 'has-day' : ''}>
              {rest.length ? (
                <>
                  <span className="notes-day">{head}</span>
                  <span>{rest.join(' — ')}</span>
                </>
              ) : (
                <span>{line}</span>
              )}
              {writing && i === lines.length - 1 && <span className="caret" aria-hidden="true" />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A quiet terminal: commands PEPO runs and what comes back. */
export function TerminalSurface({ lines = [], writing }: { lines?: string[]; writing: boolean }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [lines.length])
  return (
    <div className="terminal-surface">
      {lines.map((line, i) =>
        line.startsWith('$ ') ? (
          <div key={i} className="term-cmd">
            <span className="term-prompt">pepo ›</span> {line.slice(2)}
          </div>
        ) : (
          <div key={i} className={line.startsWith('✓') ? 'term-ok' : 'term-out'}>
            {line}
          </div>
        ),
      )}
      {writing && (
        <div className="term-cmd">
          <span className="term-prompt">pepo ›</span> <span className="caret" aria-hidden="true" />
        </div>
      )}
      <div ref={end} />
    </div>
  )
}

/** Tools opened from the dock before PEPO has put anything in them. */
export function EmptySurface({ icon: Icon, hint }: { icon: LucideIcon; hint: string }) {
  return (
    <div className="empty-surface">
      <Icon size={22} strokeWidth={1.2} />
      <p>{hint}</p>
    </div>
  )
}
