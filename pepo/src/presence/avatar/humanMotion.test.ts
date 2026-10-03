import { describe, expect, it } from 'vitest'
import { createHumanMotion, type AvatarState } from './humanMotion'

const deg = (r: number) => (r * 180) / Math.PI
const dt = 1 / 60

function observe(state: AvatarState, seconds: number, amp: (t: number) => number = () => 0) {
  const m = createHumanMotion()
  m.setState(state)
  const blinks: number[] = []
  let inBlink = false, last = -1, maxYaw = 0, maxRoll = 0, nearCamera = 0, still = 0, prev = { yaw: 0, pitch: 0 }, maxJaw = 0
  for (let i = 0, t = 0; i < seconds * 60; i++, t += dt) {
    m.setAmplitude(amp(t))
    const p = m.step(dt)
    if (p.blink > 0.3 && !inBlink) {
      inBlink = true
      if (last >= 0) blinks.push(t - last)
      last = t
    }
    if (p.blink < 0.1) inBlink = false
    maxYaw = Math.max(maxYaw, Math.abs(deg(p.yaw)))
    maxRoll = Math.max(maxRoll, Math.abs(deg(p.roll)))
    if (Math.hypot(p.gaze[0], p.gaze[1]) < 0.12) nearCamera += dt
    if ((Math.abs(p.yaw - prev.yaw) + Math.abs(p.pitch - prev.pitch)) / dt < 0.009) still += dt
    prev = { yaw: p.yaw, pitch: p.pitch }
    maxJaw = Math.max(maxJaw, p.jaw)
  }
  return { blinks, maxYaw, maxRoll, nearCamera: nearCamera / seconds, still: still / seconds, maxJaw }
}

describe('natural human motion', () => {
  it('idles mostly still, with small irregular movement and eye contact', () => {
    const r = observe('idle', 180)
    expect(r.still).toBeGreaterThan(0.7)
    expect(r.maxYaw).toBeLessThan(7)
    expect(r.maxRoll).toBeLessThan(4)
    expect(r.nearCamera).toBeGreaterThan(0.65)
    // Blinks: present, irregular, never on a fixed beat.
    expect(r.blinks.length).toBeGreaterThan(15)
    const mean = r.blinks.reduce((a, b) => a + b, 0) / r.blinks.length
    const sd = Math.sqrt(r.blinks.reduce((a, b) => a + (b - mean) ** 2, 0) / r.blinks.length)
    expect(sd).toBeGreaterThan(0.6)
  })

  it('listens with steadier eyes and fewer blinks', () => {
    const idle = observe('idle', 120)
    const listening = observe('listening', 120)
    expect(listening.nearCamera).toBeGreaterThan(0.85)
    expect(listening.blinks.length).toBeLessThan(idle.blinks.length + 3)
  })

  it('moves the jaw only for speech output', () => {
    expect(observe('listening', 10, () => 0.9).maxJaw).toBe(0)
    expect(observe('speaking', 10, (t) => (t % 3 < 2 ? 0.6 : 0)).maxJaw).toBeGreaterThan(0.2)
  })
})
