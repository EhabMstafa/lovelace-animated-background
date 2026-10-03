/**
 * FATHI's motion controller, ported from the original avatar (fathi-avatar.js)
 * with its tuning intact. Pure and bounded: it turns a presence state and an
 * audio level into head pose, gaze, blinks, brows, breath and mouth shape.
 *
 * Only speaking amplitude opens the jaw. Microphone energy while listening
 * brightens the face, but never moves the mouth: no fabricated lip sync.
 */

export type FathiState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'tool'

export interface FathiMotion {
  yaw: number
  pitch: number
  roll: number
  jaw: number
  blink: number
  blinkActive: boolean
  brow: number
  brows: [number, number]
  squint: number
  breath: number
  speak: number
  listen: number
  phraseActive: boolean
  gaze: [number, number]
  body: [number, number]
  viseme: [number, number, number]
}

/** How much he moves. Deliberate poses in this rig are 0.036–0.060 rad. */
export const MOTION_GAIN = {
  speechYaw: 0.02,
  speechRoll: 0.013,
  speechPitch: 0.017,
  nodSpeech: 0.024,
  nodListen: 0.02,
  mouthShape: 1,
}

const ZERO: FathiMotion = {
  yaw: 0, pitch: 0, roll: 0, jaw: 0, blink: 0, blinkActive: false, brow: 0, brows: [0, 0], squint: 0,
  breath: 0, speak: 0, listen: 0, phraseActive: false, gaze: [0, 0], body: [0, 0], viseme: [0, 0, 0],
}

/** Per-state light gains: x = cool (face), y = warm (mask), z = thinking tint. */
export function presenceLight(state: FathiState, amplitude = 0): [number, number, number] {
  const level = Math.max(0, Math.min(1, amplitude || 0))
  switch (state) {
    case 'speaking': return [1.03, 1.12 + level * 0.5, 0]
    case 'listening': return [1.13 + level * 0.22, 0.96, 0]
    case 'thinking': return [1.14, 0.88, 0.14]
    case 'tool': return [1.08, 1.02, 0.24]
    default: return [1.03, 1.08, 0]
  }
}

export function createFathiMotion(random: () => number = Math.random) {
  let time = 0, state: FathiState = 'idle', amp = 0, ampAt = -10, energy = 0, reduced = false
  let nextPose = 0, target = [0, 0, 0], nextBlink = 3 + random() * 4, blinkStart = -10, blinkDuration = 0.25, blinkDepth = 0.7
  const pose = [0, 0, 0]
  const viseme: [number, number, number] = [0, 0, 0]
  let lastEnergy = 0
  const gaze: [number, number] = [0, 0]
  let gazeTarget: [number, number] = [0, 0], nextGaze = 0.7 + random() * 1.4
  let pointer: [number, number] = [0, 0], pointerActive = false, pointerWeight = 0
  const expression = [0, 0, 0]
  let nextNod = 3 + random() * 3, nodStart = -10, nodStrength = 0, lastNod = -10
  const clamp = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0)
  const ease = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x) }
  let current: FathiMotion = { ...ZERO }

  return {
    setState(s: FathiState) {
      if (s !== state) {
        state = s
        nextPose = Math.min(nextPose, time + 0.12)
        nextGaze = Math.min(nextGaze, time + 0.18)
      }
    },
    setAmplitude(a: number) { amp = clamp(a); ampAt = time },
    setPointer(x: number, y: number, active = true) {
      pointer = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))]
      pointerActive = active
    },
    setReduced(v: boolean) {
      reduced = v
      if (v) current = { ...ZERO }
    },
    step(dtIn: number): FathiMotion {
      const dt = Math.max(0, Math.min(0.12, dtIn))
      time += dt
      if (reduced) return current
      const speaking = state === 'speaking'
      const thinking = state === 'thinking' || state === 'tool'
      const focus = state === 'listening'
      const input = speaking && time - ampAt < 0.25 ? Math.max(0, (amp - 0.025) / 0.975) : 0
      energy += (input - energy) * (1 - Math.exp(-dt / (input > energy ? 0.075 : 0.15)))
      const onset = Math.max(0, (energy - lastEnergy) / Math.max(dt, 0.001))
      lastEnergy = energy

      if (time >= nextPose) {
        const spread = thinking ? 0.09 : focus ? 0.032 : speaking ? 0.055 : 0.068
        target = [
          (random() - 0.5) * spread,
          (thinking ? 0.018 : focus ? -0.01 : speaking ? -0.006 : 0) + (random() - 0.5) * 0.019,
          (random() - 0.5) * (thinking ? 0.028 : speaking ? 0.02 : 0.017),
        ]
        nextPose = time + (focus ? 3.8 : thinking ? 2.4 : 2.9) + random() * (focus ? 3.4 : 3.0)
      }
      for (let i = 0; i < 3; i++) pose[i] += (target[i] - pose[i]) * (1 - Math.exp(-dt / 1.1))

      if (time >= nextGaze) {
        gazeTarget = thinking
          ? [(random() < 0.5 ? -1 : 1) * (0.26 + random() * 0.36), 0.1 + random() * 0.2]
          : focus ? [(random() - 0.5) * 0.16, (random() - 0.5) * 0.08]
          : speaking ? [(random() - 0.5) * 0.22, (random() - 0.5) * 0.1]
          : [(random() - 0.5) * 0.38, (random() - 0.5) * 0.14]
        nextGaze = time + (thinking ? 1.7 : focus ? 3.0 : 2.2) + random() * (thinking ? 2.2 : 3.2)
      }
      pointerWeight += (Number(pointerActive) - pointerWeight) * (1 - Math.exp(-dt / (pointerActive ? 0.13 : 0.48)))
      const cue = [
        gazeTarget[0] * (1 - pointerWeight) + pointer[0] * 0.82 * pointerWeight,
        gazeTarget[1] * (1 - pointerWeight) + pointer[1] * 0.62 * pointerWeight,
      ]
      for (let i = 0; i < 2; i++) gaze[i] += (cue[i] - gaze[i]) * (1 - Math.exp(-dt / 0.24))

      if (focus && time >= nextNod) {
        nodStart = time
        nodStrength = MOTION_GAIN.nodListen * (0.5 + random() * 0.5)
        nextNod = time + 4.5 + random() * 4
        lastNod = time
      }
      if (speaking && onset > 0.75 && time - lastNod > 1.15) {
        nodStart = time
        nodStrength = MOTION_GAIN.nodSpeech * (0.45 + Math.min(0.55, onset * 0.18))
        lastNod = time
      }
      const nodPhase = (time - nodStart) / 0.62
      const nod = nodPhase >= 0 && nodPhase < 1 ? (nodPhase < 0.42 ? ease(nodPhase / 0.42) : 1 - ease((nodPhase - 0.42) / 0.58)) * nodStrength : 0

      if (time >= nextBlink && !(speaking && energy > 0.12 && time - nextBlink < 1.4)) {
        blinkStart = time
        blinkDuration = (state === 'thinking' ? 0.29 : 0.22) + random() * 0.07
        blinkDepth = random() < 0.2 ? 0.4 : 0.68 + random() * 0.15
        nextBlink = time + 3 + random() * 4 + (focus || speaking ? 1.8 : 0)
      }
      const phase = (time - blinkStart) / blinkDuration
      const blink = phase >= 0 && phase < 1 ? blinkDepth * (phase < 0.32 ? ease(phase / 0.32) : 1 - ease((phase - 0.32) / 0.68)) : 0

      // Without a spectrum, mouth shape falls back to energy alone (no fake visemes).
      const raw = [energy * 0.64, MOTION_GAIN.mouthShape * energy * 0.12, MOTION_GAIN.mouthShape * energy * 0.08]
      for (let i = 0; i < 3; i++) viseme[i] += (raw[i] - viseme[i]) * (1 - Math.exp(-dt / (raw[i] > viseme[i] ? 0.055 : 0.11)))

      const speechYaw = energy * Math.sin(time * 2.1) * MOTION_GAIN.speechYaw
      const speechRoll = energy * Math.sin(time * 1.27 + 0.8) * MOTION_GAIN.speechRoll
      const brow = (focus ? 0.125 : thinking ? 0.095 : 0) + energy * 0.15 + Math.min(0.1, onset * 0.018)
      const thinkSide = (thinking ? 1 : 0) * gaze[0] * 0.065
      const exTarget = [clamp(brow - thinkSide), clamp(brow + thinkSide), clamp((focus ? 0.1 : thinking ? 0.035 : 0) + energy * (0.035 + 0.055 * viseme[1]))]
      for (let i = 0; i < 3; i++) expression[i] += (exTarget[i] - expression[i]) * (1 - Math.exp(-dt / (exTarget[i] > expression[i] ? 0.13 : 0.24)))

      const breathPhase = time * 0.82
      const breathWave = (Math.sin(breathPhase) + 0.22 * Math.sin(breathPhase * 2 - 1.1)) / 1.22
      const breathScale = speaking ? 0.68 : thinking ? 0.88 : 1
      const life = 1.1
      current = {
        yaw: (pose[0] + speechYaw + gaze[0] * (0.006 + 0.012 * pointerWeight)) * 1.16 * life,
        pitch: (pose[1] - energy * MOTION_GAIN.speechPitch + nod - gaze[1] * (0.004 + 0.006 * pointerWeight)) * 1.11 * life,
        roll: (pose[2] + speechRoll) * 1.05 * life,
        jaw: viseme[0],
        speak: energy,
        listen: focus ? 1 : 0,
        blink,
        blinkActive: phase >= 0 && phase < 1,
        brow: clamp(brow * life),
        squint: clamp(expression[2] * life),
        brows: [clamp(expression[0] * life), clamp(expression[1] * life)],
        breath: Math.max(-0.018, Math.min(0.018, breathWave * 0.0105 * breathScale * life)),
        phraseActive: energy > 0.03,
        gaze: [Math.max(-1, Math.min(1, gaze[0] * life)), Math.max(-1, Math.min(1, gaze[1] * life))],
        body: [Math.sin(time * 0.37) * 0.007 * life, Math.sin(time * 0.31 + 0.9) * 0.005 * life],
        viseme: [viseme[0], viseme[1], viseme[2]],
      }
      return current
    },
  }
}
