import type { WorkspaceWindow } from '../core/workspace'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface SpatialLayout {
  /** Where PEPO's presence sits (stage centre, in px) and how large. */
  presence: { x: number; y: number; scale: number }
  rects: Record<string, Rect>
  mode: 'desktop' | 'tablet' | 'sheet'
}

/** Larger, richer tools take the prime position. */
const PRIORITY = ['map', 'browser', 'code', 'images', 'files', 'notes', 'terminal']

const GAP = 14

/**
 * The workspace reorganises itself around the task: with nothing open,
 * PEPO sits in the centre; as tools arrive PEPO steps aside and the
 * surfaces settle into a calm arrangement next to it.
 */
export function computeLayout(windows: WorkspaceWindow[], W: number, H: number): SpatialLayout {
  const ordered = [...windows].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || a.openedAt - b.openedAt)
  const rects: Record<string, Rect> = {}
  const n = ordered.length
  const orbY = H * (W <= 640 ? 0.4 : 0.41)

  if (n === 0) return { presence: { x: W / 2, y: orbY, scale: 1 }, rects, mode: W <= 640 ? 'sheet' : W < 1024 ? 'tablet' : 'desktop' }

  if (W <= 640) {
    // Phone: PEPO rises, the newest tool opens as a bottom sheet.
    const latest = [...windows].sort((a, b) => b.openedAt - a.openedAt)[0]
    rects[latest.id] = { x: 10, y: H * 0.36, w: W - 20, h: H * 0.64 - 112 }
    for (const w of windows) if (!rects[w.id]) rects[w.id] = { ...rects[latest.id] }
    return { presence: { x: W / 2, y: H * 0.19, scale: 0.5 }, rects, mode: 'sheet' }
  }

  let region: Rect
  let presence: SpatialLayout['presence']
  let mode: SpatialLayout['mode']
  if (W < 1024) {
    presence = { x: W / 2, y: H * 0.2, scale: 0.55 }
    region = { x: 20, y: H * 0.37, w: W - 40, h: H * 0.63 - 170 }
    mode = 'tablet'
  } else {
    presence = { x: W * 0.255, y: orbY, scale: 0.8 }
    const left = W * 0.45
    region = { x: left, y: 78, w: W - left - 28, h: H - 78 - 168 }
    mode = 'desktop'
  }

  const { x, y, w, h } = region
  if (n === 1) {
    rects[ordered[0].id] = { x, y, w, h }
  } else if (n === 2) {
    const h1 = (h - GAP) * 0.6
    rects[ordered[0].id] = { x, y, w, h: h1 }
    rects[ordered[1].id] = { x, y: y + h1 + GAP, w, h: h - h1 - GAP }
  } else if (n === 3) {
    const h1 = (h - GAP) * 0.58
    const w2 = (w - GAP) / 2
    rects[ordered[0].id] = { x, y, w, h: h1 }
    rects[ordered[1].id] = { x, y: y + h1 + GAP, w: w2, h: h - h1 - GAP }
    rects[ordered[2].id] = { x: x + w2 + GAP, y: y + h1 + GAP, w: w2, h: h - h1 - GAP }
  } else {
    const cols = 2
    const rows = Math.ceil(n / cols)
    const cw = (w - GAP) / cols
    const rh = (h - GAP * (rows - 1)) / rows
    ordered.forEach((win, i) => {
      rects[win.id] = { x: x + (i % cols) * (cw + GAP), y: y + Math.floor(i / cols) * (rh + GAP), w: cw, h: rh }
    })
  }
  return { presence, rects, mode }
}
