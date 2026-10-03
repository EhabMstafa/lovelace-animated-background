/**
 * PEPO AVATAR — natural human motion, as a motion controller for FATHI.
 *
 * FATHI's renderer, drawing and rig are used unchanged; only the behaviour
 * that drives the rig comes from here (see createFathiAvatar's `controller`
 * option). The interface matches FATHI's own controller.
 *
 * The target is "a calm real person sitting in front of a webcam":
 * about 80% stillness, 20% meaningful movement. Every layer runs on its own
 * irregular clock (breath, blinks, gaze, head, brows, posture), nothing is a
 * loop, and nothing is driven by raw audio except the jaw.
 *
 * Priority of motion: eyes, eyelids, head, jaw, brows, neck, shoulders, torso.
 * Larger movements follow conversational events (listening starts, a phrase
 * begins or ends, PEPO is interrupted, a semantic cue from the runtime),
 * never individual words or the loudness of the voice.
 */

/** PEPO's presence states, as the Avatar's body language understands them. */
export type AvatarState =
  | 'idle'
  | 'attentive'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'working'
  | 'waiting'
  | 'success'
  | 'error'

/** Conversational meaning the runtime can attach to what PEPO says. */
export type AvatarCue =
  | 'nod'
  | 'agree'
  | 'strongAgree'
  | 'question'
  | 'emphasis'
  | 'consider'
  | 'conclude'
  | 'lookLeft'
  | 'lookRight'
  | 'understand'
  | 'interest'
  | 'surprise'
  | 'empathy'

const CUES: readonly string[] = ['nod', 'agree', 'strongAgree', 'question', 'emphasis', 'consider', 'conclude', 'lookLeft', 'lookRight', 'understand', 'interest', 'surprise', 'empathy']

/** The pose FATHI's rig reads (same fields as FATHI's own controller). */
export interface AvatarPose {
  /** Head rotation in radians (yaw, pitch: + is chin down, roll). */
  yaw: number
  pitch: number
  roll: number
  jaw: number
  /** Eyelid closure 0..1. */
  blink: number
  blinkActive: boolean
  brow: number
  brows: [number, number]
  /** Attentive narrowing of the eyes. */
  squint: number
  /** Chest/shoulder breath offset. */
  breath: number
  body: [number, number]
  /** Eye direction, -1..1 (x right, y up). */
  gaze: [number, number]
  viseme: [number, number, number]
  bands: [number, number, number]
  speak: number
  listen: number
  /** True while something is moving: FATHI then redraws at its faster pace. */
  phraseActive: boolean
  stateAge: number
}

/** FATHI's state names, for callers that only speak FATHI's vocabulary. */
const FROM_FATHI: Record<string, AvatarState> = {
  idle: 'idle', listening: 'listening', thinking: 'thinking', processing: 'thinking', speaking: 'speaking',
  tool: 'working', 'tool-active': 'working', error: 'error', muted: 'waiting', offline: 'waiting',
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const ease = (t: number) => {
  t = clamp(t, 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Damped spring. ζ a little under 1 gives the tiny overshoot and correction
 * of real movement; never linear, never perfectly smooth.
 */
class Spring {
  x = 0
  v = 0
  target = 0
  constructor(public omega: number, public zeta: number) {}
  step(dt: number) {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / n
    for (let i = 0; i < n; i++) {
      const a = this.omega * this.omega * (this.target - this.x) - 2 * this.zeta * this.omega * this.v
      this.v += a * h
      this.x += this.v * h
    }
    return this.x
  }
}

interface Timed {
  at: number
  run: () => void
}

/** A short one-shot curve added on top of a channel (nods, emphasis). */
interface Pulse {
  start: number
  dur: number
  amp: number
  shape: (t: number) => number
}

const nodShape = (t: number) =>
  // Down with a gentle acceleration, up a little past neutral, settle.
  t < 0.4 ? ease(t / 0.4) : t < 0.8 ? 1 - 1.12 * ease((t - 0.4) / 0.4) : -0.12 * (1 - ease((t - 0.8) / 0.2))
const holdShape = (t: number) => (t < 0.25 ? ease(t / 0.25) : t < 0.7 ? 1 : 1 - ease((t - 0.7) / 0.3))

/** @param rand random source in [0, 1); pass a seeded one for repeatable behaviour (tests). */
export function createHumanMotion(rand: () => number = Math.random) {
  const range = (a: number, b: number) => a + rand() * (b - a)
  const chance = (p: number) => rand() < p
  const sign = () => (rand() < 0.5 ? -1 : 1)
  /** Log-normal interval: mostly near the mean, occasionally much longer. */
  const interval = (mean: number, spread: number, lo: number, hi: number) =>
    clamp(mean * Math.exp((rand() + rand() + rand() - 1.5) * spread), lo, hi)
  let time = 0
  let state: AvatarState = 'idle'
  let stateSince = 0
  let reduced = false
  /** Once PEPO drives the presence directly, FATHI's coarse setState is ignored. */
  let driven = false
  const queue: Timed[] = []
  const later = (delay: number, run: () => void) => queue.push({ at: time + delay, run })

  // ── Breath: each cycle has its own length and depth ──
  let breathPhase = rand()
  let breathPeriod = range(3.5, 6)
  let breathAmp = 1
  const nextBreath = (prep = false) => {
    breathPhase = 0
    if (prep) {
      breathPeriod = range(1.3, 1.9)
      breathAmp = range(0.9, 1.15)
      return
    }
    breathPeriod = range(3.5, 6) * (state === 'speaking' ? 1.12 : 1)
    breathAmp = chance(0.12) ? range(1.35, 1.65) : range(0.75, 1.05)
  }

  // ── Blinks ──
  let blinkAt = time + interval(4, 0.5, 1.5, 9)
  let lastBlink = -10
  let blinkCurve: { start: number; dur: number; depth: number; close: number } | null = null
  const blinkMean = () =>
    ({ idle: 4.2, attentive: 5.0, listening: 5.8, thinking: 3.6, speaking: 3.9, interrupted: 5, working: 4.6, waiting: 4.4, success: 4, error: 3.8 })[state]
  const startBlink = (kind?: 'normal' | 'slow' | 'partial') => {
    if (time - lastBlink < 0.45) return
    const r = rand()
    const k = kind ?? (r < 0.1 ? 'partial' : r < 0.25 ? 'slow' : 'normal')
    const dur = k === 'slow' ? range(0.22, 0.35) : range(0.1, 0.22)
    const depth = k === 'partial' ? range(0.35, 0.5) : range(0.78, 0.92)
    blinkCurve = { start: time, dur, depth, close: range(0.3, 0.4) }
    lastBlink = time
    // Rarely, a double blink.
    if (!kind && chance(0.07)) later(dur + range(0.08, 0.15), () => startBlink('normal'))
  }
  // Irregular intervals, and now and then a long gap with no blink at all.
  const scheduleBlink = () =>
    (blinkAt = time + (chance(0.1) ? range(7.5, 12) : interval(blinkMean(), 0.65, 1.0, 10)))

  // ── Gaze: eyes lead, the head follows a moment later ──
  const gazeX = new Spring(36, 0.92)
  const gazeY = new Spring(36, 0.92)
  let gazeBase: [number, number] = [0, 0]
  let micro: [number, number] = [0, 0]
  let microAt = time + range(0.4, 1.4)
  let gazeAt = time + range(1.5, 4)
  let pointer: [number, number] = [0, 0]
  let pointerActive = false
  let pointerWeight = 0
  const look = (x: number, y: number, follow = true) => {
    gazeBase = [x, y]
    // The head follows the eyes by a degree or two, 100–250 ms later.
    if (follow) later(range(0.1, 0.25), () => {
      headFollow = [x * range(0.02, 0.035), -y * range(0.012, 0.02)]
    })
  }
  const glanceAndReturn = (x: number, y: number, hold: number) => {
    look(x, y)
    later(hold, () => look(range(-0.04, 0.04), range(-0.03, 0.03)))
  }
  let headFollow: [number, number] = [0, 0]

  // ── Head and posture: still most of the time, irregular corrections ──
  const yaw = new Spring(4.0, 0.72)
  const pitch = new Spring(4.4, 0.74)
  const roll = new Spring(3.6, 0.75)
  const lean = new Spring(1.6, 0.9)
  const followYaw = new Spring(5.5, 0.8)
  const followPitch = new Spring(5.5, 0.8)
  let posture = { yaw: 0, pitch: 0, roll: 0, lean: 0 }
  let postureAt = time + range(2, 6)
  const pulses: { pitch: Pulse[]; roll: Pulse[]; lean: Pulse[] } = { pitch: [], roll: [], lean: [] }
  const pulse = (ch: keyof typeof pulses, amp: number, dur: number, shape = nodShape, delay = 0) =>
    pulses[ch].push({ start: time + delay, dur, amp, shape })
  const nod = (kind: 'micro' | 'agree' | 'strong' | 'settle') => {
    if (kind === 'micro') pulse('pitch', range(0.016, 0.026), range(0.42, 0.52))
    else if (kind === 'agree') pulse('pitch', range(0.035, 0.05), range(0.5, 0.6))
    else if (kind === 'settle') pulse('pitch', range(0.014, 0.022), range(0.6, 0.75))
    else {
      pulse('pitch', range(0.042, 0.055), 0.48)
      pulse('pitch', range(0.026, 0.036), 0.46, nodShape, 0.46)
    }
  }
  const tilt = (amount: number, dur: number) => pulse('roll', amount, dur, holdShape)

  // ── Brows: barely noticeable micro-reactions, slightly asymmetric ──
  const browL = new Spring(9, 0.85)
  const browR = new Spring(9, 0.85)
  const brow = (l: number, r: number, hold: number) => {
    browL.target = l
    later(range(0.03, 0.09), () => (browR.target = r))
    later(hold, () => {
      browL.target = 0
      later(range(0.03, 0.09), () => (browR.target = 0))
    })
  }
  const squint = new Spring(5, 0.9)
  /** Brief eyelid widening (surprise) or softening (empathy), on top of the state's squint. */
  let lidAccent = 0
  let lidAccentUntil = -10
  /** Movement scale: smaller screens get a little less, so nothing looks exaggerated. */
  let scale = 1
  /** Empathy: quieter movement for a while. */
  let calmUntil = -10

  // ── Speech: jaw from audio; everything larger from phrasing ──
  let jawEnv = 0
  let amp = 0
  let ampAt = -10
  let voiced = false
  let voicedFor = 0
  let silentFor = 0
  let glancedThisPhrase = false
  let releaseFast = 0

  // ── Body: shoulders settle into small, slow asymmetries ──
  const swayX = new Spring(1.1, 0.95)
  const swayR = new Spring(1.1, 0.95)
  let bodyAt = time + range(4, 10)

  // ── Listening acknowledgements ──
  let ackAt = Infinity

  function enter(next: AvatarState, prev: AvatarState) {

    if (next === 'interrupted' || (next === 'listening' && prev === 'speaking')) {
      // Speech stops: the jaw releases within ~150 ms, the eyes find the user,
      // a small head adjustment, then the listening posture.
      ackAt = Infinity
      releaseFast = 0.35
      look(0, 0)
      posture = { ...posture, pitch: -0.012, lean: 0.006 }
      later(0.35, () => (posture = { ...posture, pitch: 0, lean: 0.014 }))
      if (next === 'listening') ackAt = time + range(4, 7)
    } else if (next === 'attentive') {
      // Someone is about to speak or type: eyes settle on them, movement quiets.
      ackAt = Infinity
      later(range(0.1, 0.2), () => look(range(-0.02, 0.02), range(-0.015, 0.015)))
      later(range(0.2, 0.4), () => (posture = { yaw: posture.yaw * 0.5, pitch: 0, roll: posture.roll * 0.5, lean: 0.006 }))
      if (chance(0.35)) later(range(0.15, 0.35), () => brow(range(0.08, 0.14), range(0.06, 0.12), range(0.5, 0.8)))
    } else if (next === 'listening') {
      if (prev === 'interrupted') {
        // Already attending: just settle into listening.
        later(range(0.2, 0.4), () => (posture = { ...posture, lean: 0.014 }))
      } else {
        later(range(0.15, 0.25), () => look(range(-0.03, 0.03), range(-0.02, 0.02)))
        later(range(0.3, 0.6), () => (posture = { yaw: posture.yaw * 0.4, pitch: 0, roll: posture.roll * 0.5, lean: 0.014 }))
        if (chance(0.55)) later(range(0.2, 0.5), () => brow(range(0.14, 0.22), range(0.1, 0.18), range(0.6, 0.9)))
      }
      ackAt = time + range(3.5, 6.5)
      scheduleBlink()
    } else if (next === 'working') {
      // Focused on the work beside it: eyes go to the work, the head barely follows.
      ackAt = Infinity
      later(range(0.2, 0.4), () => look(range(0.14, 0.24), range(-0.16, -0.08)))
      if (chance(0.4)) later(range(0.4, 0.8), () => startBlink('normal'))
    } else if (next === 'thinking') {
      // Stillness first; then the eyes drift up and aside; a slow blink.
      ackAt = Infinity
      const side = sign()
      later(range(0.25, 0.4), () => look(side * range(0.18, 0.35), range(0.22, 0.4), false))
      if (chance(0.6)) later(range(0.55, 0.85), () => startBlink('slow'))
      if (chance(0.4)) later(range(0.3, 0.6), () => brow(side > 0 ? 0.05 : 0.18, side > 0 ? 0.18 : 0.05, range(1.2, 2)))
      if (chance(0.35)) later(range(0.4, 0.9), () => tilt(side * range(0.012, 0.025), range(1.6, 2.6)))
      if (chance(0.4)) later(range(1.4, 2.6), () => look(side * range(0.05, 0.15), range(0.05, 0.15), false))
    } else if (next === 'speaking') {
      // Preparation: a tiny inhale, a posture adjustment, eyes return, maybe a blink.
      ackAt = Infinity
      nextBreath(true)
      look(range(-0.03, 0.03), range(-0.02, 0.02))
      posture = { ...posture, pitch: range(-0.006, 0.004), lean: range(0.004, 0.012) }
      if (chance(0.45)) later(range(0.05, 0.2), () => startBlink('normal'))
      voiced = false
      silentFor = 0.5
    } else if (next === 'success') {
      // Done: a small settling nod, a soft brow lift, eyes on the user.
      ackAt = Infinity
      look(range(-0.02, 0.02), range(-0.01, 0.02))
      later(range(0.1, 0.25), () => nod('settle'))
      if (chance(0.5)) later(range(0.15, 0.35), () => brow(range(0.08, 0.14), range(0.08, 0.14), range(0.6, 0.9)))
      later(range(0.8, 1.4), () => (posture = { ...posture, lean: 0 }))
    } else if (next === 'error') {
      // Something went wrong: a slow blink, a brief look down, a small tilt.
      ackAt = Infinity
      later(range(0.1, 0.25), () => startBlink('slow'))
      later(range(0.2, 0.4), () => glanceAndReturn(range(-0.05, 0.05), -range(0.18, 0.26), range(0.6, 1.1)))
      if (chance(0.5)) later(range(0.3, 0.6), () => tilt(sign() * range(0.01, 0.02), range(1.2, 1.8)))
      later(range(0.2, 0.4), () => brow(0.1, 0.04, range(0.9, 1.4)))
    } else if (next === 'idle' || next === 'waiting') {
      ackAt = Infinity
      if (prev === 'speaking') {
        if (chance(0.45)) later(range(0.1, 0.3), () => nod('settle'))
        if (chance(0.4)) later(range(0.2, 0.5), () => startBlink())
      }
      later(range(0.8, 1.6), () => (posture = { ...posture, lean: 0 }))
    }
  }

  /** Meaning from the runtime, expressed with restraint. */
  function cue(kind: AvatarCue) {
    switch (kind) {
      case 'nod': nod('micro'); break
      case 'agree': nod('agree'); break
      case 'strongAgree': nod('strong'); break
      case 'conclude': nod('settle'); break
      case 'question':
        tilt(sign() * range(0.018, 0.03), range(1.2, 1.8))
        brow(range(0.12, 0.2), range(0.1, 0.16), range(0.6, 0.9))
        break
      case 'emphasis':
        pulse('lean', range(0.014, 0.022), range(0.8, 1.1), holdShape)
        brow(range(0.1, 0.16), range(0.1, 0.16), range(0.4, 0.6))
        break
      case 'consider': {
        const side = sign()
        look(side * range(0.2, 0.32), range(0.15, 0.3), false)
        tilt(side * range(0.012, 0.022), range(1.4, 2))
        later(range(1, 1.6), () => look(range(-0.03, 0.03), range(-0.02, 0.02)))
        break
      }
      case 'lookLeft': glanceAndReturn(-range(0.35, 0.5), range(-0.05, 0.05), range(0.8, 1.4)); break
      case 'lookRight': glanceAndReturn(range(0.35, 0.5), range(-0.05, 0.05), range(0.8, 1.4)); break
      // Micro-expressions: barely there.
      case 'understand': brow(range(0.06, 0.1), range(0.05, 0.09), range(0.35, 0.55)); break
      case 'interest': brow(range(0.12, 0.18), range(0.1, 0.16), range(0.7, 1.1)); break
      case 'surprise':
        brow(range(0.18, 0.24), range(0.16, 0.22), range(0.5, 0.7))
        lidAccent = -0.25
        lidAccentUntil = time + range(0.35, 0.5)
        break
      case 'empathy':
        look(range(-0.03, 0.03), -range(0.04, 0.08))
        lidAccent = 0.08
        lidAccentUntil = time + range(1.5, 2.5)
        calmUntil = time + range(3, 5)
        break
    }
  }

  function phraseStart() {
    glancedThisPhrase = false
    if (chance(0.3)) pulse('lean', range(0.012, 0.022), range(0.8, 1.2), holdShape)
    else if (chance(0.18)) nod('micro')
    if (chance(0.2)) brow(range(0.14, 0.22), range(0.12, 0.2), range(0.4, 0.6))
  }

  function phraseEnd(length: number) {
    if (length < 0.8) return
    const r = rand()
    if (r < 0.32) startBlink()
    else if (r < 0.55) nod('settle')
    else if (r < 0.72) glanceAndReturn(sign() * range(0.12, 0.25), range(-0.1, 0.1), range(0.3, 0.7))
    // The rest: stillness.
    if (chance(0.3)) nextBreath(true)
  }

  const REST: AvatarPose = {
    yaw: 0, pitch: 0, roll: 0, jaw: 0, blink: 0, blinkActive: false, brow: 0, brows: [0, 0], squint: 0, breath: 0,
    body: [0, 0], gaze: [0, 0], viseme: [0, 0, 0], bands: [0, 0, 0], speak: 0, listen: 0, phraseActive: false, stateAge: 0,
  }
  let current: AvatarPose = { ...REST }

  const apply = (next: AvatarState) => {
    if (next === state) return
    const prev = state
    state = next
    stateSince = time
    enter(next, prev)
  }

  return {
    /** PEPO's presence state (the full vocabulary). */
    setPresence(next: AvatarState) {
      driven = true
      apply(next)
    },
    /** FATHI's coarse state; ignored once PEPO drives the presence itself. */
    setState(name: string) {
      if (driven) return
      const next = FROM_FATHI[String(name).toLowerCase()]
      if (next) apply(next)
    },
    /** Speech output level (0..1). Only moves the jaw while speaking; microphone levels are ignored. */
    setAmplitude(a: number) {
      amp = clamp(Number.isFinite(a) ? a : 0, 0, 1)
      ampAt = time
    },
    setSpectrum() {},
    setFormants() {},
    setVitality() {
      return 'natural'
    },
    setPointer(x: number, y: number, active = true) {
      pointer = [clamp(Number(x) || 0, -1, 1), clamp(Number(y) || 0, -1, 1)]
      pointerActive = !!active
    },
    setReduced(v: boolean) {
      reduced = !!v
      if (reduced) current = { ...REST }
    },
    blink() {
      if (reduced) return false
      startBlink('normal')
      return true
    },
    gesture(kind: string) {
      if (reduced || !CUES.includes(kind)) return false
      cue(kind as AvatarCue)
      return true
    },
    /**
     * Glance toward something that just appeared (a surface PEPO opened),
     * then back to the user. x, y: direction on screen, -1..1 (x right, y up).
     */
    lookToward(x: number, y: number) {
      if (reduced) return
      glanceAndReturn(clamp(x, -1, 1) * range(0.32, 0.45), clamp(y, -1, 1) * range(0.2, 0.3), range(0.6, 0.9))
    },
    /** Overall movement scale (1 desktop; less on small screens). */
    setScale(k: number) {
      scale = clamp(k, 0.4, 1)
    },
    get motion() {
      return current
    },
    step(dtIn: number): AvatarPose {
      const dt = clamp(Number.isFinite(dtIn) ? dtIn : 0, 0, 0.12)
      time += dt
      if (reduced) return current

      // Scheduled reactions.
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].at <= time) {
          const job = queue[i]
          queue.splice(i, 1)
          job.run()
        }
      }

      // Breath.
      breathPhase += dt / breathPeriod
      if (breathPhase >= 1) nextBreath()
      const inhale = 0.42
      const wave = breathPhase < inhale ? ease(breathPhase / inhale) : 1 - ease((breathPhase - inhale) / 0.5)
      const breath = clamp((wave - 0.35) * breathAmp * (state === 'speaking' ? 0.7 : 1) * 0.0125, -0.012, 0.016)

      // Blinks: probability-based, never synchronised with breath.
      if (time >= blinkAt) {
        startBlink()
        scheduleBlink()
      }
      let blink = 0
      if (blinkCurve) {
        const t = (time - blinkCurve.start) / blinkCurve.dur
        if (t >= 1) blinkCurve = null
        else blink = blinkCurve.depth * (t < blinkCurve.close ? ease(t / blinkCurve.close) : 1 - ease((t - blinkCurve.close) / (1 - blinkCurve.close)))
      }

      // Gaze plans, by state. Mostly near the camera.
      if (time >= gazeAt) {
        const r = rand()
        if (state === 'idle' || state === 'waiting') {
          if (r < 0.25) glanceAndReturn(sign() * range(0.15, 0.3), range(-0.15, 0.12), range(0.6, 2))
          else if (r < 0.37) glanceAndReturn(range(-0.08, 0.08), -range(0.2, 0.3), range(1, 2.5))
          else if (r < 0.45) glanceAndReturn(sign() * range(0.38, 0.55), range(-0.1, 0.1), range(1.5, 3.5))
          gazeAt = time + range(2, 7)
        } else if (state === 'listening' || state === 'attentive' || state === 'interrupted') {
          if (r < 0.3) glanceAndReturn(sign() * range(0.06, 0.12), range(-0.06, 0.04), range(0.4, 1))
          gazeAt = time + range(5, 11)
        } else if (state === 'working') {
          // Between the work and the user: back to the user now and then.
          if (r < 0.35) glanceAndReturn(range(-0.03, 0.03), range(-0.02, 0.02), range(0.8, 1.6))
          later(range(1.8, 2.6), () => state === 'working' && look(range(0.12, 0.24), range(-0.16, -0.06)))
          gazeAt = time + range(4, 8)
        } else if (state === 'speaking') {
          if (r < 0.3 && voiced && !glancedThisPhrase) {
            glancedThisPhrase = true
            glanceAndReturn(sign() * range(0.18, 0.35), range(-0.08, 0.18), range(0.4, 1.1))
          }
          gazeAt = time + range(2.5, 6)
        } else {
          gazeAt = time + range(3, 6)
        }
      }
      // Micro-saccades: tiny, quick, irregular.
      if (time >= microAt) {
        const scale = state === 'listening' || state === 'attentive' ? 0.6 : 1
        micro = [range(-0.035, 0.035) * scale, range(-0.025, 0.025) * scale]
        microAt = time + range(0.35, 1.5)
      }
      pointerWeight += ((pointerActive ? 1 : 0) - pointerWeight) * (1 - Math.exp(-dt / (pointerActive ? 0.15 : 0.6)))
      gazeX.target = (gazeBase[0] + micro[0]) * (1 - pointerWeight * 0.7) + pointer[0] * 0.55 * pointerWeight
      gazeY.target = (gazeBase[1] + micro[1]) * (1 - pointerWeight * 0.7) + pointer[1] * 0.45 * pointerWeight
      const gx = gazeX.step(dt)
      const gy = gazeY.step(dt)

      // Posture: irregular, often no change at all.
      if (time >= postureAt) {
        const amp = { idle: 1, attentive: 0.4, listening: 0.45, thinking: 0.3, speaking: 0.6, interrupted: 0.3, working: 0.4, waiting: 0.8, success: 0.5, error: 0.4 }[state]
        const still = { idle: 0.3, attentive: 0.55, listening: 0.5, thinking: 0.6, speaking: 0.45, interrupted: 0.8, working: 0.55, waiting: 0.4, success: 0.6, error: 0.6 }[state]
        if (!chance(still)) {
          const r = rand()
          if (r < 0.3) posture = { ...posture, yaw: clamp(posture.yaw + sign() * range(0.006, 0.04) * amp, -0.06, 0.06) }
          else if (r < 0.55) posture = { ...posture, roll: sign() * range(0.008, 0.045) * amp }
          else if (r < 0.75) posture = { ...posture, pitch: range(-0.012, 0.012) * amp, lean: state === 'listening' ? 0.014 : range(-0.004, 0.02) * amp }
          else if (r < 0.82 && state === 'speaking') posture = { ...posture, yaw: sign() * range(0.06, 0.11) }
          else posture = { yaw: posture.yaw * 0.25, pitch: 0, roll: posture.roll * 0.2, lean: state === 'listening' ? 0.014 : 0 }
        }
        postureAt = time + (state === 'speaking' ? range(2, 5) : state === 'idle' || state === 'waiting' ? range(3, 9) : range(4, 10))
      }

      // Listening: sparse silent acknowledgements.
      if (state === 'listening' && time >= ackAt) {
        if (!chance(0.3)) {
          const r = rand()
          if (r < 0.55) nod('micro')
          else if (r < 0.85) nod('agree')
          else if (r < 0.92) nod('strong')
          else tilt(sign() * range(0.015, 0.03), range(1.2, 2))
          if (chance(0.25)) later(range(0.2, 0.5), () => startBlink('normal'))
        }
        ackAt = time + range(5, 11)
      }

      // Speech: jaw from the audio envelope; phrases from its pauses.
      const live = state === 'speaking' && time - ampAt < 0.25 ? Math.max(0, (amp - 0.03) / 0.97) : 0
      if (releaseFast > 0) releaseFast -= dt
      const release = releaseFast > 0 ? 0.05 : 0.12
      jawEnv += (live - jawEnv) * (1 - Math.exp(-dt / (live > jawEnv ? 0.05 : release)))
      if (state === 'speaking') {
        const isVoiced = jawEnv > 0.07
        if (isVoiced) {
          if (!voiced && silentFor > 0.32) phraseStart()
          voiced = true
          voicedFor += dt
          silentFor = 0
          if (voicedFor > 2.2 && !glancedThisPhrase && chance(dt * 0.25)) {
            glancedThisPhrase = true
            glanceAndReturn(sign() * range(0.15, 0.3), range(-0.05, 0.15), range(0.4, 0.9))
          }
        } else {
          silentFor += dt
          if (voiced && silentFor > 0.32) {
            phraseEnd(voicedFor)
            voiced = false
            voicedFor = 0
          }
        }
      }
      const syllable = 0.72 + 0.28 * Math.sin(time * 13.7 + Math.sin(time * 5.3) * 2.1)
      const jaw = clamp(jawEnv * syllable * 0.85, 0, 1)

      // Body.
      if (time >= bodyAt) {
        swayX.target = range(-0.006, 0.006)
        swayR.target = range(-0.004, 0.004)
        bodyAt = time + range(6, 14)
      }

      // Brows and attentiveness.
      squint.target =
        { idle: 0, attentive: 0.05, listening: 0.08, thinking: 0.12, speaking: 0.03, interrupted: 0.06, working: 0.1, waiting: 0, success: 0, error: 0.04 }[state] +
        (time < lidAccentUntil ? lidAccent : 0)

      // Head: posture + nods + following the eyes + the skull riding the jaw.
      yaw.target = posture.yaw
      pitch.target = posture.pitch
      roll.target = posture.roll
      lean.target = posture.lean
      followYaw.target = headFollow[0]
      followPitch.target = headFollow[1]
      const sum = (list: Pulse[]) => {
        let v = 0
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i]
          const t = (time - p.start) / p.dur
          if (t < 0) continue
          if (t >= 1) {
            list.splice(i, 1)
            continue
          }
          v += p.amp * p.shape(t)
        }
        return v
      }

      const pulsing = pulses.pitch.length + pulses.roll.length + pulses.lean.length > 0
      const leanNow = lean.step(dt) + sum(pulses.lean)
      const bl = browL.step(dt)
      const br = browR.step(dt)
      const yawNow = yaw.step(dt) + followYaw.step(dt)
      const moving = Math.abs(gazeX.v) + Math.abs(gazeY.v) > 0.08 || Math.abs(yaw.v) + Math.abs(pitch.v) + Math.abs(roll.v) > 0.004
      // Smaller screens and empathy both mean less movement.
      const k = scale * (time < calmUntil ? 0.7 : 1)
      const rollNow = roll.step(dt) + sum(pulses.roll)
      current = {
        yaw: yawNow * k,
        // The skull rides the jaw by a hair (smoothed envelope, never per syllable).
        // FATHI's rig has no lean, so leaning in reads as the chin dipping slightly.
        pitch: (pitch.step(dt) + followPitch.step(dt) + sum(pulses.pitch) + leanNow * 0.8) * k + jawEnv * 0.002,
        roll: rollNow * k,
        jaw,
        blink,
        blinkActive: blinkCurve !== null,
        brow: (bl + br) / 2,
        brows: [bl, br],
        squint: squint.step(dt),
        breath,
        // Neck and shoulders stay connected: the torso follows large head turns by a hair.
        body: [swayX.step(dt) + yawNow * k * 0.04, swayR.step(dt) + rollNow * k * 0.12],
        gaze: [gx, gy],
        viseme: [jaw, jaw * 0.3 * (0.5 + 0.5 * Math.sin(time * 7.1)), jaw * 0.22 * (0.5 + 0.5 * Math.sin(time * 5.3 + 1))],
        bands: [0, 0, 0],
        speak: jawEnv,
        listen: state === 'listening' ? 1 : 0,
        phraseActive: jawEnv > 0.03 || pulsing || moving,
        stateAge: time - stateSince,
      }
      return current
    },
  }
}
