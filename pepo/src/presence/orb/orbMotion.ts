import type { PresenceState } from '../../core/presence'

/**
 * The Orb's motion signals, separate from its look. Most of the Orb's
 * movement comes from its semantic state (stateParams.ts); this adds the
 * living parts with restraint:
 * - breath: a slow, nearly imperceptible energy cycle whose length varies
 *   (4–7 s) so it never reads as a loop;
 * - voice: microphone and speech levels pass a noise gate, are normalised and
 *   smoothed with a slow attack and a slower release, so the Orb follows
 *   phrases, not syllables, and audio stays a minority of the motion;
 * - emphasis: a semantic cue from the runtime gives one gentle rise in light;
 * - wave: when a phrase begins (or on emphasis) one soft wave of energy
 *   travels from inside to the edge, once; never per syllable.
 */
export interface OrbSignals {
  /** -1..1, the breath wave. */
  breath: number
  /** 0..1, smoothed microphone level while listening. */
  listen: number
  /** 0..1, phrase-level speech energy while speaking. */
  speak: number
  /** 0..~0.1, extra light from an emphasis cue. */
  emphasis: number
  /** 0..1 while one outward wave travels (about 1.8 s), else 0. */
  wave: number
}

const NOISE_GATE = 0.08
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function createOrbMotion(rand: () => number = Math.random) {
  let phase = rand()
  let period = 4 + rand() * 3
  let depth = 1
  let listen = 0
  let speak = 0
  let emphasisAt = -10
  let waveAt = -10
  let time = 0

  const follow = (current: number, target: number, attack: number, release: number, dt: number) =>
    current + (target - current) * (1 - Math.exp(-dt / (target > current ? attack : release)))

  return {
    /** A semantic cue from the runtime (only emphasis changes the Orb). */
    cue(kind: string) {
      if (kind === 'emphasis') {
        emphasisAt = time
        if (time - waveAt > 1.8) waveAt = time
      }
    },
    step(dt: number, state: PresenceState, level: number): OrbSignals {
      dt = Math.min(Math.max(dt, 0), 0.1)
      time += dt

      phase += dt / period
      if (phase >= 1) {
        phase -= 1
        period = 4 + rand() * 3
        depth = rand() < 0.15 ? 1.25 : 0.75 + rand() * 0.3
      }
      // Asymmetric: a slightly quicker inhale than exhale.
      const wave = phase < 0.42 ? Math.sin((phase / 0.42) * Math.PI * 0.5) : Math.cos(((phase - 0.42) / 0.58) * Math.PI * 0.5)
      const breath = (wave * 2 - 1) * depth

      const gated = clamp01((level - NOISE_GATE) / (1 - NOISE_GATE))
      listen = follow(listen, state === 'listening' ? gated : 0, 0.25, 0.6, dt)
      // Interrupted: speaking energy resolves quickly, then listening takes over.
      const before = speak
      speak = follow(speak, state === 'speaking' ? gated : 0, 0.15, state === 'interrupted' ? 0.12 : 0.5, dt)
      // A phrase begins: the envelope rises out of a pause.
      if (before < 0.2 && speak >= 0.2 && time - waveAt > 2.5) waveAt = time

      const e = time - emphasisAt
      const emphasis = e >= 0 && e < 0.9 ? 0.1 * Math.sin((e / 0.9) * Math.PI) : 0
      const w = (time - waveAt) / 1.8
      return { breath, listen, speak, emphasis, wave: w >= 0 && w < 1 ? w : 0 }
    },
  }
}
