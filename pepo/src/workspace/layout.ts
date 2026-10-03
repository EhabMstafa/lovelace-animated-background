import type { Rect, WorkspaceWindow } from '../core/workspace'

export type { Rect }

export interface SpatialLayout {
  /** Where PEPO's presence sits (stage centre, in px) and how large. */
  presence: { x: number; y: number; scale: number }
  /** Where PEPO's words sit while it works: under the presence, clear of the surfaces. */
  caption: { x: number; y: number; w: number }
  /** Surfaces on screen. Open surfaces without a rect wait in the dock until brought forward. */
  rects: Record<string, Rect>
  mode: 'desktop' | 'tablet' | 'sheet'
}

/** Larger, richer tools take the prime position. */
const PRIORITY = ['map', 'browser', 'code', 'images', 'files', 'notes', 'conversation', 'terminal']

const GAP = 14
const HEADER = 64
/** Room kept for the voice surface and the dock. */
const BOTTOM = 168
const MIN_H = 150

/** The presence stage's side in px, as the stylesheet sizes it (--stage). */
export function stageSize(W: number, H: number) {
  if (W <= 640) return Math.min(1.28 * W, 0.72 * H)
  if (W <= 1024) return Math.min(0.84 * H, 1.1 * W, 900)
  return Math.min(0.9 * H, 1.04 * W, 980)
}

// The body occupies part of its square stage: from 14% to 86% of its height
// (the Avatar's crown to its shoulders), and 82% of its width.
const BODY_TOP = 0.14
const BODY_BOTTOM = 0.86
const BODY_W = 0.82

/**
 * The workspace reorganises itself around the task: with nothing open,
 * PEPO sits in the centre; as tools arrive PEPO steps aside and the
 * surfaces settle into a calm arrangement next to it. Only as many
 * surfaces as fit comfortably are shown: the one in front, then the richest.
 */
export function computeLayout(all: WorkspaceWindow[], W: number, H: number, stage = stageSize(W, H)): SpatialLayout {
  const rects: Record<string, Rect> = {}
  // Put-away surfaces take no space. Surfaces the user moved or resized keep
  // their own rect (kept on screen) but still hold their slot in PEPO's
  // arrangement, so their neighbours don't jump to fill it.
  const shownAll = all.filter((w) => !w.minimized)
  const placed = W > 640 ? shownAll.filter((w) => w.placed) : []
  const windows = shownAll
  const keepPlaced = () => {
    for (const w of placed) {
      const p = w.placed!
      const pw = Math.min(p.w, W - 16)
      const ph = Math.min(p.h, H - 120)
      rects[w.id] = { x: Math.min(Math.max(8, p.x), W - pw - 8), y: Math.min(Math.max(56, p.y), H - ph - 60), w: pw, h: ph }
    }
  }
  const empty = { x: W / 2, y: H * 0.7, w: Math.min(560, W - 40) }

  if (shownAll.length === 0) {
    return { presence: { x: W / 2, y: H * (W <= 640 ? 0.4 : 0.41), scale: 1 }, caption: empty, rects, mode: W <= 640 ? 'sheet' : W < 1024 ? 'tablet' : 'desktop' }
  }

  if (W <= 640) {
    // Phone: PEPO rises, the newest tool opens as a bottom sheet.
    // The tabs for switching surfaces sit in the gap between the two.
    const s = Math.min(0.5, (H * 0.27) / (stage * (BODY_BOTTOM - BODY_TOP)))
    const y = HEADER - 6 + (0.5 - BODY_TOP) * stage * s
    const top = y + (BODY_BOTTOM - 0.5) * stage * s + 48
    const latest = [...windows].sort((a, b) => b.openedAt - a.openedAt)[0]
    rects[latest.id] = { x: 10, y: top, w: W - 20, h: H - top - 112 }
    for (const w of windows) if (!rects[w.id]) rects[w.id] = { ...rects[latest.id] }
    return { presence: { x: W / 2, y, scale: s }, caption: empty, rects, mode: 'sheet' }
  }

  let presence: SpatialLayout['presence']
  let caption: SpatialLayout['caption']
  let region: Rect
  let mode: SpatialLayout['mode']

  if (W >= 760 && W >= H * 1.15) {
    // Side by side: PEPO keeps a column on the left, the work fills the right.
    const col = Math.min(600, Math.max(260, W * 0.36))
    const s = Math.min(0.8, col / (stage * BODY_W), (H - HEADER - BOTTOM - 40) / (stage * (BODY_BOTTOM - BODY_TOP)))
    const y = Math.max(H * 0.41, HEADER + 8 + (0.5 - BODY_TOP) * stage * s)
    presence = { x: 24 + col / 2, y, scale: s }
    caption = { x: presence.x, y: y + (BODY_BOTTOM - 0.5) * stage * s + 14, w: col - 8 }
    const left = 24 + col + 24
    region = { x: left, y: HEADER + 14, w: W - left - 28, h: H - HEADER - 14 - BOTTOM }
    mode = W >= 1024 ? 'desktop' : 'tablet'
  } else {
    // Stacked: PEPO above, its words under it, the work below.
    const bodyH = Math.min(240, Math.max(130, H * 0.24))
    const s = Math.min(0.6, bodyH / (stage * (BODY_BOTTOM - BODY_TOP)), (W - 40) / (stage * BODY_W))
    const y = HEADER + (0.5 - BODY_TOP) * stage * s
    presence = { x: W / 2, y, scale: s }
    caption = { x: W / 2, y: y + (BODY_BOTTOM - 0.5) * stage * s + 6, w: Math.min(560, W - 40) }
    const top = caption.y + 52
    region = { x: 20, y: top, w: W - 40, h: H - top - BOTTOM }
    mode = 'tablet'
  }

  // How many surfaces fit without becoming unreadable.
  const rows = Math.max(1, Math.floor((region.h + GAP) / (MIN_H + GAP)))
  const cols = region.w >= 2 * 300 + GAP ? 2 : 1
  const capacity = Math.max(1, Math.min(4, cols === 2 ? (rows >= 2 ? Math.min(4, rows * 2) : 2) : rows))
  // The surface just opened or brought forward is always shown; the richest tools fill the rest.
  const byPriority = (a: WorkspaceWindow, b: WorkspaceWindow) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || a.openedAt - b.openedAt
  const front = windows.reduce((a, b) => (b.z > a.z ? b : a))
  const rest = windows.filter((w) => w !== front)
  const shown = [front, ...rest.filter((w) => placed.includes(w)), ...rest.filter((w) => !placed.includes(w)).sort(byPriority)].slice(
    0,
    Math.max(capacity, placed.length + 1),
  )
  const ordered = shown.sort(byPriority)
  const n = ordered.length

  const { x, y, w, h } = region
  if (n === 1) {
    rects[ordered[0].id] = { x, y, w, h }
  } else if (n === 2) {
    if (rows >= 2 || cols === 1) {
      const h1 = (h - GAP) * 0.6
      rects[ordered[0].id] = { x, y, w, h: h1 }
      rects[ordered[1].id] = { x, y: y + h1 + GAP, w, h: h - h1 - GAP }
    } else {
      const w1 = (w - GAP) * 0.58
      rects[ordered[0].id] = { x, y, w: w1, h }
      rects[ordered[1].id] = { x: x + w1 + GAP, y, w: w - w1 - GAP, h }
    }
  } else if (n === 3 && cols === 2) {
    const h1 = (h - GAP) * 0.58
    const w2 = (w - GAP) / 2
    rects[ordered[0].id] = { x, y, w, h: h1 }
    rects[ordered[1].id] = { x, y: y + h1 + GAP, w: w2, h: h - h1 - GAP }
    rects[ordered[2].id] = { x: x + w2 + GAP, y: y + h1 + GAP, w: w2, h: h - h1 - GAP }
  } else {
    const c = cols
    const r = Math.ceil(n / c)
    const cw = (w - GAP * (c - 1)) / c
    const rh = (h - GAP * (r - 1)) / r
    ordered.forEach((win, i) => {
      rects[win.id] = { x: x + (i % c) * (cw + GAP), y: y + Math.floor(i / c) * (rh + GAP), w: cw, h: rh }
    })
  }
  keepPlaced()
  return { presence, caption, rects, mode }
}
