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
    workspace.close(b)
    expect(workspace.getSnapshot().map((w) => w.kind)).toEqual(['notes'])
    workspace.closeAll()
    expect(workspace.getSnapshot()).toHaveLength(0)
  })
})
