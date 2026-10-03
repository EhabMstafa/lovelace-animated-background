import { describe, expect, it } from 'vitest'
import type { ToolKind, WorkspaceWindow } from '../core/workspace'
import { computeLayout, stageSize, type Rect } from './layout'

const win = (kind: ToolKind, i: number): WorkspaceWindow => ({ id: `${kind}-${i}`, kind, title: kind, openedAt: i, z: i, active: false, data: {}, minimized: false, placed: null })
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('computeLayout', () => {
  it('keeps PEPO centred while the workspace is empty', () => {
    const l = computeLayout([], 1536, 864)
    expect(l.presence.x).toBe(768)
    expect(l.presence.scale).toBe(1)
  })

  it('steps PEPO aside on desktop and keeps surfaces apart, on screen and clear of the dock', () => {
    const kinds: ToolKind[] = ['terminal', 'map', 'notes', 'browser']
    for (let n = 1; n <= kinds.length; n++) {
      const windows = kinds.slice(0, n).map(win)
      const { presence, rects, mode } = computeLayout(windows, 1536, 864)
      expect(mode).toBe('desktop')
      expect(presence.x).toBeLessThan(768)
      const list = windows.map((w) => rects[w.id]).filter(Boolean)
      expect(list.length).toBe(Math.min(n, 3))
      for (const r of list) {
        expect(r.x).toBeGreaterThan(presence.x)
        expect(r.x + r.w).toBeLessThanOrEqual(1536)
        expect(r.y).toBeGreaterThanOrEqual(60)
        // The voice control has moved into PEPO's column: the work reaches down to the dock.
        expect(r.y + r.h).toBeLessThanOrEqual(864 - 80)
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(overlaps(list[i], list[j])).toBe(false)
    }
  })

  it('gives the map the prime position', () => {
    const windows = [win('terminal', 1), win('notes', 2), win('map', 3)]
    const { rects } = computeLayout(windows, 1536, 864)
    expect(rects['map-3'].w * rects['map-3'].h).toBeGreaterThan(rects['notes-2'].w * rects['notes-2'].h)
    expect(rects['map-3'].y).toBeLessThan(rects['notes-2'].y)
  })

  it('shows at most three surfaces (two on tablets), always including the one in front', () => {
    const kinds: ToolKind[] = ['map', 'browser', 'code', 'images', 'files', 'notes', 'terminal']
    const windows = kinds.map(win)
    for (const [W, H] of [[1536, 864], [1100, 650], [800, 700], [768, 1024]]) {
      const { rects } = computeLayout(windows, W, H)
      const list = Object.values(rects)
      expect(list.length).toBeGreaterThanOrEqual(1)
      expect(list.length).toBeLessThanOrEqual(W >= 1024 ? 3 : 2)
      // The newest surface is always among those shown.
      expect(rects['terminal-6']).toBeDefined()
      for (const r of list) expect(r.h).toBeGreaterThanOrEqual(140)
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(overlaps(list[i], list[j])).toBe(false)
    }
  })

  it('keeps PEPO below the header and its words clear of the surfaces at every size', () => {
    for (const [W, H] of [[1536, 864], [1280, 720], [1100, 650], [900, 640], [800, 700], [768, 1024], [700, 900]]) {
      const windows = [win('map', 1), win('notes', 2), win('terminal', 3)]
      const { presence, caption, voice, rects } = computeLayout(windows, W, H)
      const S = stageSize(W, H) * presence.scale
      // The body's top (14% down its stage) stays under the 56px header.
      expect(presence.y - S / 2 + 0.14 * S).toBeGreaterThanOrEqual(56)
      const words = { x: caption.x - caption.w / 2, y: caption.y, w: caption.w, h: 44 }
      // Side by side the voice control sits in PEPO's column, under its words;
      // stacked, it stays centred under the work.
      const control = voice ? { x: voice.x - voice.w / 2, y: H - 110, w: voice.w, h: 84 } : null
      if (control) expect(words.y + words.h).toBeLessThanOrEqual(control.y)
      for (const r of Object.values(rects)) {
        expect(overlaps(words, r)).toBe(false)
        if (control) expect(overlaps(control, r)).toBe(false)
        expect(r.y + r.h).toBeLessThanOrEqual(H - (control ? 80 : 160))
      }
    }
  })

  it('gives put-away surfaces no space, and PEPO returns to the centre when all are away', () => {
    const windows = [win('map', 1), { ...win('notes', 2), minimized: true }]
    const { rects } = computeLayout(windows, 1536, 864)
    expect(rects['map-1']).toBeDefined()
    expect(rects['notes-2']).toBeUndefined()
    const away = computeLayout(windows.map((w) => ({ ...w, minimized: true })), 1536, 864)
    expect(away.presence.scale).toBe(1)
    expect(away.presence.x).toBe(768)
  })

  it("keeps a surface where the user put it, on screen", () => {
    const placed = { ...win('notes', 2), placed: { x: 40, y: 500, w: 420, h: 300 } }
    const { rects } = computeLayout([win('map', 1), placed], 1536, 864)
    expect(rects['notes-2']).toEqual({ x: 40, y: 500, w: 420, h: 300 })
    const off = computeLayout([{ ...placed, placed: { x: 1400, y: 800, w: 420, h: 300 } }], 1536, 864)
    const r = off.rects['notes-2']
    expect(r.x + r.w).toBeLessThanOrEqual(1536)
    expect(r.y + r.h).toBeLessThanOrEqual(864)
  })

  it('moves PEPO to the right when the user has put their work on the left', () => {
    const placed = { ...win('notes', 2), placed: { x: 40, y: 120, w: 520, h: 420 } }
    const l = computeLayout([win('map', 1), placed], 1536, 864)
    expect(l.presence.x).toBeGreaterThan(768)
    expect(l.rects['map-1'].x + l.rects['map-1'].w).toBeLessThan(l.presence.x)
    expect(computeLayout([win('map', 1)], 1536, 864, undefined, { side: 'right' }).presence.x).toBeGreaterThan(768)
  })

  it('lifts PEPO to the upper corner when three surfaces are open', () => {
    const two = computeLayout([win('map', 1), win('notes', 2)], 1536, 864)
    const three = computeLayout([win('map', 1), win('notes', 2), win('browser', 3)], 1536, 864)
    expect(three.presence.y).toBeLessThan(two.presence.y)
    expect(three.presence.y - (stageSize(1536, 864) * three.presence.scale) * 0.36).toBeGreaterThanOrEqual(56)
  })

  it('opens tools as a bottom sheet on phones', () => {
    const { presence, mode, rects } = computeLayout([win('map', 1), win('notes', 2)], 390, 844)
    expect(mode).toBe('sheet')
    expect(presence.y).toBeLessThan(844 * 0.3)
    expect(rects['notes-2'].w).toBe(370)
  })

  it('keeps the toolbar\'s strip free at the left or right, and gives a hidden toolbar no room', () => {
    const windows = [win('map', 1), win('notes', 2), win('terminal', 3)]
    for (const [W, H] of [[1536, 864], [1280, 720], [800, 700]]) {
      const left = computeLayout(windows, W, H, undefined, { dock: { side: 'left' } })
      const right = computeLayout(windows, W, H, undefined, { dock: { side: 'right' } })
      for (const r of Object.values(left.rects)) expect(r.x).toBeGreaterThanOrEqual(76)
      for (const r of Object.values(right.rects)) expect(r.x + r.w).toBeLessThanOrEqual(W - 76)
      // PEPO's body stays clear of the strip too.
      const S = stageSize(W, H) * left.presence.scale
      expect(left.presence.x - 0.41 * S).toBeGreaterThanOrEqual(76 - 1)
      // With no toolbar at the bottom the work reaches lower.
      const bottom = computeLayout(windows, W, H)
      const low = (l: typeof bottom) => Math.max(...Object.values(l.rects).map((r) => r.y + r.h))
      expect(low(left)).toBeGreaterThan(low(bottom))
      const hidden = computeLayout(windows, W, H, undefined, { dock: { side: 'bottom', hidden: true } })
      // Side by side, a hidden toolbar takes no room (stacked, the voice control still sits over its place).
      if (W >= H * 1.15) expect(low(hidden)).toBeGreaterThan(low(bottom))
    }
  })
})
