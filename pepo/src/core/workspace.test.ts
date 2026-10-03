import { describe, expect, it } from 'vitest'
import { workspace } from './workspace'

describe('workspace store', () => {
  it('opens one surface per tool, merges data, focuses and closes', () => {
    workspace.closeAll()
    const a = workspace.open('notes', 'Notes', { lines: ['a'] })
    const b = workspace.open('map', 'Map')
    expect(workspace.open('notes', 'Notes again')).toBe(a)
    workspace.update(a, { active: true, data: { heading: 'Trip' } })
    const notes = workspace.find('notes')!
    expect(notes.active).toBe(true)
    expect(notes.data).toEqual({ lines: ['a'], heading: 'Trip' })
    workspace.focus(a)
    const [first, second] = [workspace.find('notes')!, workspace.find('map')!]
    expect(first.z).toBeGreaterThan(second.z)
    workspace.minimize(a)
    expect(workspace.find('notes')!.minimized).toBe(true)
    workspace.focus(a)
    expect(workspace.find('notes')!.minimized).toBe(false)
    workspace.place(b, { x: 10, y: 20, w: 300, h: 200 })
    expect(workspace.find('map')!.placed).toEqual({ x: 10, y: 20, w: 300, h: 200 })
    workspace.minimizeAll()
    expect(workspace.getSnapshot().every((w) => w.minimized)).toBe(true)
    workspace.restoreAll()
    expect(workspace.getSnapshot().some((w) => w.minimized)).toBe(false)
    workspace.close(b)
    expect(workspace.getSnapshot().map((w) => w.kind)).toEqual(['notes'])
    workspace.closeAll()
    expect(workspace.getSnapshot()).toHaveLength(0)
  })
})
