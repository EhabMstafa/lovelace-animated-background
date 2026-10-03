import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Lock, RotateCw, Search } from 'lucide-react'

export interface BrowserResult {
  title: string
  url: string
  snippet: string
}
export interface BrowserPage {
  title: string
  site: string
  blocks: ({ h: string } | { p: string } | { list: string[] })[]
}
export interface BrowserData {
  query?: string
  results?: BrowserResult[]
  pages?: Record<string, BrowserPage>
  /** The page in view (a key of `pages`), or none for the results. */
  view?: string | null
  loading?: boolean
}

const host = (url: string) => url.replace(/^https?:\/\//, '').split('/')[0]

/**
 * A browser surface: an address bar and the page. Pages arrive as readable
 * content from PEPO's runtime (no embedded third-party sites), shown as
 * search results or a clean reader view.
 */
export function BrowserSurface({ data }: { data: BrowserData }) {
  const [view, setView] = useState<string | null>(data.view ?? null)
  const [history, setHistory] = useState<(string | null)[]>([])
  useEffect(() => setView(data.view ?? null), [data.view])

  const page = view ? data.pages?.[view] : undefined
  const address = view ?? (data.query ? `Search · ${data.query}` : 'New tab')
  const open = (url: string) => {
    if (!data.pages?.[url]) return
    setHistory((h) => [...h, view])
    setView(url)
  }
  const back = () => {
    if (!history.length) return
    setView(history[history.length - 1])
    setHistory((h) => h.slice(0, -1))
  }

  return (
    <div className="browser-surface">
      <div className="browser-bar">
        <button className="icon-btn" onClick={back} disabled={!history.length} aria-label="Back">
          <ArrowLeft size={14} strokeWidth={1.6} />
        </button>
        <button className="icon-btn" disabled aria-label="Forward">
          <ArrowRight size={14} strokeWidth={1.6} />
        </button>
        <button className="icon-btn" aria-label="Reload">
          <RotateCw size={13} strokeWidth={1.6} className={data.loading ? 'is-spinning' : ''} />
        </button>
        <div className="browser-address" title={address}>
          {view ? <Lock size={11} strokeWidth={1.8} /> : <Search size={11} strokeWidth={1.8} />}
          <span>{view ? view.replace(/^https?:\/\//, '') : address}</span>
        </div>
      </div>
      <div className="browser-page">
        {page ? (
          <article className="reader">
            <p className="reader-site">{page.site}</p>
            <h1>{page.title}</h1>
            {page.blocks.map((b, i) =>
              'h' in b ? (
                <h2 key={i}>{b.h}</h2>
              ) : 'p' in b ? (
                <p key={i}>{b.p}</p>
              ) : (
                <ul key={i}>
                  {b.list.map((li) => (
                    <li key={li}>{li}</li>
                  ))}
                </ul>
              ),
            )}
          </article>
        ) : data.results?.length ? (
          <ol className="results">
            {data.results.map((r) => (
              <li key={r.url}>
                <span className="result-host">{host(r.url)}</span>
                <button className="result-title" onClick={() => open(r.url)} disabled={!data.pages?.[r.url]}>
                  {r.title}
                </button>
                <p>{r.snippet}</p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty-surface">
            <p>Ask PEPO to look something up.</p>
          </div>
        )}
      </div>
    </div>
  )
}
