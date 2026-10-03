import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { paintScene, type SceneMood } from './scene'

/** A painted thumbnail (see scene.ts). */
function SceneCanvas({ seed, mood, pan = 0, className }: { seed: number; mood: SceneMood; pan?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = el.clientWidth || 320
    const h = el.clientHeight || 200
    el.width = Math.round(w * dpr)
    el.height = Math.round(h * dpr)
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    paintScene(ctx, w, h, seed, mood, pan)
  }, [seed, mood, pan])
  return <canvas ref={ref} className={className} aria-hidden="true" />
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// ── Images ──────────────────────────────────────────────

export interface ImageItem {
  title: string
  meta?: string
  seed: number
  mood: SceneMood
}
export interface ImagesData {
  title?: string
  items?: ImageItem[]
}

/** Images: a calm grid; click one to see it large. */
export function ImagesSurface({ data }: { data: ImagesData }) {
  const [open, setOpen] = useState<number | null>(null)
  const items = data.items ?? []
  if (!items.length) return <div className="empty-surface"><p>Ask PEPO to show or make an image.</p></div>
  const big = open !== null ? items[open] : null
  return (
    <div className="images-surface">
      {big ? (
        <div className="image-view">
          <button className="image-back" onClick={() => setOpen(null)}>All images</button>
          <SceneCanvas seed={big.seed} mood={big.mood} className="image-large" />
          <p className="image-caption">{big.title}{big.meta ? ` · ${big.meta}` : ''}</p>
        </div>
      ) : (
        <ul className="image-grid">
          {items.map((it, i) => (
            <li key={it.title}>
              <button onClick={() => setOpen(i)} aria-label={`Open ${it.title}`}>
                <SceneCanvas seed={it.seed} mood={it.mood} className="image-thumb" />
                <span>{it.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Video ───────────────────────────────────────────────

export interface VideoData {
  title?: string
  duration?: number
  seed?: number
  mood?: SceneMood
  /** Timed captions: [start seconds, text]. */
  captions?: [number, string][]
}

/** Video: one frame, play / pause, a scrubber and captions. Animates only while playing. */
export function VideoSurface({ data }: { data: VideoData }) {
  const duration = data.duration ?? 0
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      setT((v) => {
        const next = v + (now - last) / 1000
        if (next >= duration) {
          setPlaying(false)
          return duration
        }
        return next
      })
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, duration])

  if (!duration) return <div className="empty-surface"><p>Ask PEPO to find a video.</p></div>
  const caption = [...(data.captions ?? [])].reverse().find(([at]) => t >= at)?.[1]
  // The frame is repainted a few times a second while playing, not every frame.
  const pan = Math.round((t / duration) * 40) / 40
  return (
    <div className="video-surface">
      <div className="video-frame">
        <SceneCanvas seed={data.seed ?? 3} mood={data.mood ?? 'day'} pan={pan} className="video-canvas" />
        {caption && <p className="video-caption">{caption}</p>}
        {!playing && (
          <button className="video-big-play" onClick={() => setPlaying(true)} aria-label="Play">
            <Play size={22} strokeWidth={1.6} />
          </button>
        )}
      </div>
      <div className="video-controls">
        <button className="icon-btn" onClick={() => setT(Math.max(0, t - 10))} aria-label="Back 10 seconds"><SkipBack size={14} strokeWidth={1.6} /></button>
        <button className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause size={15} strokeWidth={1.6} /> : <Play size={15} strokeWidth={1.6} />}
        </button>
        <button className="icon-btn" onClick={() => setT(Math.min(duration, t + 10))} aria-label="Forward 10 seconds"><SkipForward size={14} strokeWidth={1.6} /></button>
        <input
          className="scrubber"
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          aria-label="Position"
        />
        <span className="video-time">{fmt(t)} / {fmt(duration)}</span>
      </div>
      {data.title && <p className="video-title">{data.title}</p>}
    </div>
  )
}

// ── Media (audio) ───────────────────────────────────────

export interface MediaData {
  queue?: { title: string; artist: string; duration: number }[]
}

/** Media: what's playing, quietly. A slim progress line, no visualiser. */
export function MediaSurface({ data }: { data: MediaData }) {
  const queue = data.queue ?? []
  const [i, setI] = useState(0)
  const [t, setT] = useState(0)
  const [playing, setPlaying] = useState(false)
  const track = queue[i]
  useEffect(() => {
    if (!playing || !track) return
    const id = window.setInterval(() => setT((v) => {
      if (v + 0.5 >= track.duration) {
        setI((n) => (n + 1) % queue.length)
        return 0
      }
      return v + 0.5
    }), 500)
    return () => window.clearInterval(id)
  }, [playing, track, queue.length])
  if (!track) return <div className="empty-surface"><p>Ask PEPO to play something.</p></div>
  return (
    <div className="media-surface">
      <div className="media-now">
        <SceneCanvas seed={11 + i * 7} mood={(['dusk', 'night', 'dawn'] as const)[i % 3]} className="media-art" />
        <div className="media-info">
          <p className="media-title">{track.title}</p>
          <p className="media-artist">{track.artist}</p>
          <div className="media-progress" aria-hidden="true"><span style={{ width: `${(t / track.duration) * 100}%` }} /></div>
          <div className="media-row">
            <span className="video-time">{fmt(t)}</span>
            <span className="media-buttons">
              <button className="icon-btn" onClick={() => { setI((n) => (n - 1 + queue.length) % queue.length); setT(0) }} aria-label="Previous"><SkipBack size={14} strokeWidth={1.6} /></button>
              <button className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
                {playing ? <Pause size={15} strokeWidth={1.6} /> : <Play size={15} strokeWidth={1.6} />}
              </button>
              <button className="icon-btn" onClick={() => { setI((n) => (n + 1) % queue.length); setT(0) }} aria-label="Next"><SkipForward size={14} strokeWidth={1.6} /></button>
            </span>
            <span className="video-time">{fmt(track.duration)}</span>
          </div>
        </div>
      </div>
      <ol className="media-queue">
        {queue.map((q, n) => (
          <li key={q.title} className={n === i ? 'is-current' : ''}>
            <button onClick={() => { setI(n); setT(0) }}>
              <span>{q.title}</span>
              <span className="video-time">{fmt(q.duration)}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

// ── Preview ─────────────────────────────────────────────

export interface PreviewData {
  file?: string
  kind?: 'ticket' | 'page'
  fields?: [string, string][]
  note?: string
}

/** Preview: a file shown as itself (here, a ticket), without opening an app. */
export function PreviewSurface({ data }: { data: PreviewData }) {
  if (!data.file) return <div className="empty-surface"><p>Ask PEPO to preview a file.</p></div>
  return (
    <div className="preview-surface">
      <p className="preview-file">{data.file}</p>
      <div className="preview-page">
        <div className="ticket-head">
          <span>Vy · Bergen Line</span>
          <span>Seat reservation</span>
        </div>
        <dl className="ticket-fields">
          {(data.fields ?? []).map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {data.note && <p className="ticket-note">{data.note}</p>}
        <div className="ticket-code" aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => <span key={i} style={{ width: `${1 + ((i * 7) % 4)}px` }} />)}
        </div>
      </div>
    </div>
  )
}
