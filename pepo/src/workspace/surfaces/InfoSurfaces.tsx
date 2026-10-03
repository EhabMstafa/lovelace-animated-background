import { useMemo, useState } from 'react'
import { Search as SearchIcon, X } from 'lucide-react'
import { setPresenceForm } from '../../chrome/PresenceToggle'
import { conversation } from '../../core/conversation'
import { dockPrefs, useDockPrefs, type DockSide } from '../../core/dockPrefs'
import { usePresence } from '../../core/presence'
import { theme, useTheme } from '../../core/theme'
import { useReducedMotion } from '../../hooks/useReducedMotion'

// ── Calendar ────────────────────────────────────────────

export interface CalendarEvent {
  day: number
  start: number
  end: number
  title: string
  /** Proposed by PEPO, not yet confirmed. */
  tentative?: boolean
}
export interface CalendarData {
  week?: string
  days?: string[]
  events?: CalendarEvent[]
}

const HOURS = [7, 9, 11, 13, 15, 17, 19, 21]

/** Calendar: one week, hours down the side, PEPO's proposals shown as dashed. */
export function CalendarSurface({ data }: { data: CalendarData }) {
  const days = data.days ?? []
  if (!days.length) return <div className="empty-surface"><p>Ask PEPO to plan or check your week.</p></div>
  const top = (h: number) => `${((h - 7) / 15) * 100}%`
  return (
    <div className="calendar-surface">
      {data.week && <p className="calendar-week">{data.week}</p>}
      <div className="calendar-grid" style={{ gridTemplateColumns: `36px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => <div key={d} className="calendar-day">{d}</div>)}
        <div className="calendar-hours">
          {HOURS.map((h) => <span key={h} style={{ top: top(h) }}>{String(h).padStart(2, '0')}</span>)}
        </div>
        {days.map((d, i) => (
          <div key={d} className="calendar-col">
            {HOURS.map((h) => <span key={h} className="calendar-line" style={{ top: top(h) }} />)}
            {(data.events ?? []).filter((e) => e.day === i).map((e) => (
              <div key={e.title} className={`calendar-event ${e.tentative ? 'is-tentative' : ''}`} style={{ top: top(e.start), height: `calc(${top(e.end)} - ${top(e.start)})` }} title={e.title}>
                {e.title}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Research ────────────────────────────────────────────

export interface ResearchData {
  question?: string
  findings?: { text: string; refs: number[] }[]
  sources?: { title: string; site: string }[]
}

/** Research: the question, what PEPO found (with sources), and the sources. */
export function ResearchSurface({ data }: { data: ResearchData }) {
  if (!data.question) return <div className="empty-surface"><p>Ask PEPO to look into something.</p></div>
  return (
    <div className="research-surface">
      <h3>{data.question}</h3>
      <ul className="findings">
        {(data.findings ?? []).map((f) => (
          <li key={f.text}>
            {f.text}
            {f.refs.map((r) => <sup key={r}>{r}</sup>)}
          </li>
        ))}
      </ul>
      <p className="sources-label">Sources</p>
      <ol className="sources">
        {(data.sources ?? []).map((s) => (
          <li key={s.title}>
            <span>{s.title}</span>
            <span className="source-site">{s.site}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── Search ──────────────────────────────────────────────

export interface SearchItem {
  group: string
  title: string
  detail: string
}
export interface SearchData {
  query?: string
  index?: SearchItem[]
}

/** Search across what PEPO knows on this device: files, notes, the conversation. */
export function SearchSurface({ data }: { data: SearchData }) {
  const [q, setQ] = useState(data.query ?? '')
  const items = useMemo(() => {
    const said = conversation.getSnapshot().map((t) => ({ group: 'Conversation', title: t.text, detail: t.who === 'user' ? 'You said' : t.who === 'pepo' ? 'PEPO said' : 'PEPO did' }))
    return [...(data.index ?? []), ...said]
  }, [data.index])
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = terms.length ? items.filter((it) => terms.every((t) => (it.title + ' ' + it.detail).toLowerCase().includes(t))) : []
  const groups = [...new Set(hits.map((h) => h.group))]
  return (
    <div className="search-surface">
      <label className="search-field">
        <SearchIcon size={14} strokeWidth={1.6} />
        <input id="pepo-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files, notes and conversation" aria-label="Search" />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label="Clear search">
            <X size={13} strokeWidth={1.6} />
          </button>
        )}
      </label>
      <div className="search-results">
        {!terms.length ? (
          <p className="search-hint">Everything here stays on this device.</p>
        ) : !hits.length ? (
          <p className="search-hint">Nothing found for “{q}”.</p>
        ) : (
          groups.map((g) => (
            <section key={g}>
              <p className="search-group">{g}</p>
              <ul>
                {hits.filter((h) => h.group === g).slice(0, 6).map((h, i) => (
                  <li key={i}>
                    <span className="search-title">{h.title}</span>
                    <span className="search-detail">{h.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

// ── Memory ──────────────────────────────────────────────

export interface MemoryData {
  facts?: { id: string; text: string; learned: string }[]
}

/** Memory: what PEPO remembers about you, each item one click from forgotten. */
export function MemorySurface({ data, onChange }: { data: MemoryData; onChange: (facts: NonNullable<MemoryData['facts']>) => void }) {
  const facts = data.facts ?? []
  return (
    <div className="memory-surface">
      <p className="memory-lead">What PEPO remembers. It stays on this device; forget anything at any time.</p>
      {facts.length ? (
        <ul className="memory-list">
          {facts.map((f) => (
            <li key={f.id}>
              <span className="memory-text">{f.text}</span>
              <span className="memory-meta">{f.learned}</span>
              <button className="memory-forget" onClick={() => onChange(facts.filter((x) => x.id !== f.id))}>Forget</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="search-hint">Nothing remembered yet.</p>
      )}
      {facts.length > 0 && <button className="memory-clear" onClick={() => { onChange([]); conversation.clear() }}>Forget everything</button>}
    </div>
  )
}

// ── Settings ────────────────────────────────────────────

/** Settings: the few choices that matter, as real controls. */
export function SettingsSurface() {
  const { form } = usePresence()
  const current = useTheme()
  const reduced = useReducedMotion()
  const dock = useDockPrefs()
  const Choice = ({ value, options, onPick, label }: { value: string; options: [string, string][]; onPick: (v: string) => void; label: string }) => (
    <div className="setting-choice" role="radiogroup" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? 'is-active' : ''} onClick={() => onPick(v)}>{l}</button>
      ))}
    </div>
  )
  return (
    <div className="settings-surface">
      <div className="setting">
        <div><p className="setting-name">Presentation</p><p className="setting-hint">How PEPO appears. Switching never interrupts it.</p></div>
        <Choice label="Presentation" value={form} options={[['avatar', 'Avatar'], ['orb', 'Orb']]} onPick={(v) => setPresenceForm(v as 'avatar' | 'orb')} />
      </div>
      <div className="setting">
        <div><p className="setting-name">Theme</p><p className="setting-hint">Follows your system until you choose.</p></div>
        <Choice label="Theme" value={current} options={[['dark', 'Dark'], ['light', 'Light']]} onPick={(v) => theme.set(v as 'dark' | 'light')} />
      </div>
      <div className="setting">
        <div><p className="setting-name">Toolbar</p><p className="setting-hint">Where PEPO’s toolbar sits. On phones it stays under the voice control.</p></div>
        <Choice label="Toolbar position" value={dock.side} options={[['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']]} onPick={(v) => dockPrefs.set({ side: v as DockSide })} />
      </div>
      <div className="setting">
        <div><p className="setting-name">Auto-hide</p><p className="setting-hint">Hide the toolbar until the pointer reaches its edge.</p></div>
        <Choice label="Auto-hide toolbar" value={dock.autoHide ? 'on' : 'off'} options={[['off', 'Off'], ['on', 'On']]} onPick={(v) => dockPrefs.set({ autoHide: v === 'on' })} />
      </div>
      <div className="setting">
        <div><p className="setting-name">Motion</p><p className="setting-hint">Follows your system’s reduce-motion setting.</p></div>
        <span className="setting-value">{reduced ? 'Reduced' : 'Full'}</span>
      </div>
      <div className="setting">
        <div><p className="setting-name">Privacy</p><p className="setting-hint">Speech, the model and memory run on this device.</p></div>
        <span className="setting-value">Local only</span>
      </div>
    </div>
  )
}
