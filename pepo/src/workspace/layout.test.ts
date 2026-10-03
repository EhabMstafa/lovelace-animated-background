import { describe, expect, it } from 'vitest'
import type { ToolKind, WorkspaceWindow } from '../core/workspace'
import { computeLayout, stageSize, type Rect } from './layout'

const win = (kind: ToolKind, i: number): WorkspaceWindow => ({ id: `${kind}-${i}`, kind, title: kind, openedAt: i, z: i, active: false, data: {} })
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
      const list = windows.map((w) => rects[w.id])
      for (const r of list) {
        expect(r.x).toBeGreaterThan(presence.x)
        expect(r.x + r.w).toBeLessThanOrEqual(1536)
        expect(r.y).toBeGreaterThanOrEqual(60)
        expect(r.y + r.h).toBeLessThanOrEqual(864 - 160)
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

  it('shows only as many surfaces as fit, always including the one in front', () => {
    const kinds: ToolKind[] = ['map', 'browser', 'code', 'images', 'files', 'notes', 'terminal']
    const windows = kinds.map(win)
    for (const [W, H] of [[1536, 864], [1100, 650], [800, 700], [768, 1024]]) {
      const { rects } = computeLayout(windows, W, H)
      const list = Object.values(rects)
      expect(list.length).toBeGreaterThanOrEqual(1)
      expect(list.length).toBeLessThanOrEqual(4)
      // The newest surface is always among those shown.
      expect(rects['terminal-6']).toBeDefined()
      for (const r of list) expect(r.h).toBeGreaterThanOrEqual(140)
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(overlaps(list[i], list[j])).toBe(false)
    }
  })

  it('keeps PEPO below the header and its words clear of the surfaces at every size', () => {
    for (const [W, H] of [[1536, 864], [1280, 720], [1100, 650], [900, 640], [800, 700], [768, 1024], [700, 900]]) {
      const windows = [win('map', 1), win('notes', 2), win('terminal', 3)]
      const { presence, caption, rects } = computeLayout(windows, W, H)
      const S = stageSize(W, H) * presence.scale
      // The body's top (14% down its stage) stays under the 56px header.
      expect(presence.y - S / 2 + 0.14 * S).toBeGreaterThanOrEqual(56)
      const words = { x: caption.x - caption.w / 2, y: caption.y, w: caption.w, h: 44 }
      for (const r of Object.values(rects)) {
        expect(overlaps(words, r)).toBe(false)
        expect(r.y + r.h).toBeLessThanOrEqual(H - 160)
      }
    }
  })

  it('opens tools as a bottom sheet on phones', () => {
    const { presence, mode, rects } = computeLayout([win('map', 1), win('notes', 2)], 390, 844)
    expect(mode).toBe('sheet')
    expect(presence.y).toBeLessThan(844 * 0.3)
    expect(rects['notes-2'].w).toBe(370)
  })
})
