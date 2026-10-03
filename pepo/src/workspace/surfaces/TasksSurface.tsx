import { Check } from 'lucide-react'

export interface Task {
  id: string
  text: string
  done: boolean
  /** PEPO is doing this one right now. */
  doing?: boolean
  due?: string
  /** Added by PEPO rather than the user. */
  byPepo?: boolean
}
export interface TasksData {
  title?: string
  tasks?: Task[]
}

/** A task list: what's left, what PEPO is doing, what's done. You can tick things off. */
export function TasksSurface({ data, onChange }: { data: TasksData; onChange: (tasks: Task[]) => void }) {
  const tasks = data.tasks ?? []
  if (!tasks.length) {
    return (
      <div className="empty-surface">
        <p>Ask PEPO to keep track of something.</p>
      </div>
    )
  }
  const done = tasks.filter((t) => t.done).length
  const toggle = (id: string) => onChange(tasks.map((t) => (t.id === id ? { ...t, done: !t.done, doing: false } : t)))

  return (
    <div className="tasks-surface">
      <div className="tasks-head">
        <h3>{data.title ?? 'Tasks'}</h3>
        <span>
          {done} of {tasks.length} done
        </span>
      </div>
      <div className="tasks-progress" aria-hidden="true">
        <span style={{ width: `${(done / tasks.length) * 100}%` }} />
      </div>
      <ul className="tasks-list">
        {tasks.map((t) => (
          <li key={t.id} className={`task ${t.done ? 'is-done' : ''} ${t.doing ? 'is-doing' : ''}`}>
            <button className="task-check" role="checkbox" aria-checked={t.done} aria-label={t.text} onClick={() => toggle(t.id)}>
              {t.done && <Check size={12} strokeWidth={2.2} />}
            </button>
            <span className="task-text">{t.text}</span>
            <span className="task-meta">{t.doing ? 'PEPO is on it' : t.due ?? (t.byPepo ? 'Added by PEPO' : '')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
