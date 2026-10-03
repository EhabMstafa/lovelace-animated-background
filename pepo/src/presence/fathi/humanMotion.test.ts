import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../orb/geometry'
import { createHumanMotion, type AvatarPose, type AvatarState } from './humanMotion'

const deg = (r: number) => (r * 180) / Math.PI
const dt = 1 / 60

function observe(state: AvatarState, seconds: number, amp: (t: number) => number = () => 0, onFrame?: (p: AvatarPose, t: number) => void, seed = 11) {
  const m = createHumanMotion(mulberry32(seed))
  m.setPresence(state)
  const blinks: number[] = []
  const blinkLengths: number[] = []
  let inBlink = false, blinkFrom = 0, last = -1, maxYaw = 0, maxRoll = 0, nearCamera = 0, still = 0, prev = { yaw: 0, pitch: 0 }, maxJaw = 0
  const breathPeaks: number[] = []
  let b1 = 0, b2 = 0
  for (let i = 0, t = 0; i < seconds * 60; i++, t += dt) {
    m.setAmplitude(amp(t))
    const p = m.step(dt)
    onFrame?.(p, t)
    if (p.blink > 0.3 && !inBlink) {
      inBlink = true
      blinkFrom = t
      if (last >= 0) blinks.push(t - last)
      last = t
    }
    if (p.blink < 0.1 && inBlink) {
      inBlink = false
      blinkLengths.push(t - blinkFrom)
    }
    if (b1 > b2 && b1 > p.breath && b1 > 0.002) breathPeaks.push(t)
    b2 = b1
    b1 = p.breath
    maxYaw = Math.max(maxYaw, Math.abs(deg(p.yaw)))
    maxRoll = Math.max(maxRoll, Math.abs(deg(p.roll)))
    if (Math.hypot(p.gaze[0], p.gaze[1]) < 0.12) nearCamera += dt
    if ((Math.abs(p.yaw - prev.yaw) + Math.abs(p.pitch - prev.pitch)) / dt < 0.009) still += dt
    prev = { yaw: p.yaw, pitch: p.pitch }
    maxJaw = Math.max(maxJaw, p.jaw)
  }
  const gaps = breathPeaks.slice(1).map((t, i) => t - breathPeaks[i])
  return { blinks, blinkLengths, maxYaw, maxRoll, nearCamera: nearCamera / seconds, still: still / seconds, maxJaw, breathGaps: gaps }
}

const sd = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length)
}

describe('natural human motion (FATHI controller)', () => {
  it('idles mostly still, with small irregular movement and eye contact', () => {
    for (const seed of [1, 2, 3]) {
      const r = observe('idle', 180, undefined, undefined, seed)
      expect(r.still).toBeGreaterThan(0.7)
      expect(r.maxYaw).toBeLessThan(7)
      expect(r.maxRoll).toBeLessThan(4)
      expect(r.nearCamera).toBeGreaterThan(0.65)
      // Blinks: present, irregular, never on a fixed beat, mostly brief.
      expect(r.blinks.length).toBeGreaterThan(15)
      expect(sd(r.blinks)).toBeGreaterThan(0.6)
      const brief = r.blinkLengths.filter((l) => l < 0.3).length / r.blinkLengths.length
      expect(brief).toBeGreaterThan(0.6)
    }
  })

  it('breathes in cycles of about 3.5–6 s that are never identical', () => {
    const r = observe('idle', 120)
    const typical = r.breathGaps.filter((g) => g > 3.2 && g < 6.6).length / r.breathGaps.length
    expect(typical).toBeGreaterThan(0.75)
    expect(sd(r.breathGaps)).toBeGreaterThan(0.25)
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

  it('never bobs the head with the loudness of the voice', () => {
    // Same phrasing, very different loudness: head motion must not scale with it.
    const quiet = observe('speaking', 60, (t) => (t % 3 < 2 ? 0.25 : 0))
    const loud = observe('speaking', 60, (t) => (t % 3 < 2 ? 1 : 0))
    expect(loud.maxYaw).toBeLessThan(8)
    expect(Math.abs(loud.maxYaw - quiet.maxYaw)).toBeLessThan(4)
  })

  it('answers semantic cues with restrained gestures and ignores unknown ones', () => {
    const m = createHumanMotion(mulberry32(5))
    m.setPresence('speaking')
    expect(m.gesture('question')).toBe(true)
    expect(m.gesture('wave')).toBe(false)
    let maxRoll = 0
    for (let i = 0; i < 120; i++) maxRoll = Math.max(maxRoll, Math.abs(deg(m.step(dt).roll)))
    expect(maxRoll).toBeGreaterThan(0.5)
    expect(maxRoll).toBeLessThan(4)
  })

  it('releases the jaw quickly when interrupted', () => {
    const m = createHumanMotion(mulberry32(6))
    m.setPresence('speaking')
    for (let i = 0; i < 90; i++) {
      m.setAmplitude(0.8)
      m.step(dt)
    }
    m.setPresence('interrupted')
    let jaw = 1
    for (let i = 0; i < 12; i++) jaw = m.step(dt).jaw // 200 ms
    expect(jaw).toBeLessThan(0.05)
  })

  it('ignores FATHI coarse states once PEPO drives the presence', () => {
    const m = createHumanMotion(mulberry32(7))
    m.setPresence('attentive')
    m.setState('speaking')
    expect(m.step(dt).stateAge).toBeGreaterThanOrEqual(0)
    m.setAmplitude(1)
    let jaw = 0
    for (let i = 0; i < 30; i++) jaw = Math.max(jaw, m.step(dt).jaw)
    expect(jaw).toBe(0)
  })
})
