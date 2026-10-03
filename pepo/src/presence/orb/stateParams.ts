import type { PresenceState } from '../../core/presence'

/**
 * The Orb's state language, expressed as targets for a handful of
 * continuous parameters. The renderer eases towards these, so any state
 * can morph into any other without bespoke transitions.
 */
export interface OrbParams {
  /** Overall scale. Listening leans in by growing slightly. */
  scale: number
  /** Revolutions-ish per second of the particle shell. */
  spin: number
  /** Breathing amplitude (fraction of radius). */
  breath: number
  /** Inward pull of shell and halo particles. */
  converge: number
  /** How aligned orbits are and how lit the surface filaments are. */
  organize: number
  /** Visibility of internal structure. */
  depth: number
  /** Amount of violet joining the base cyan/blue. */
  violet: number
  /** Reaction to microphone amplitude. */
  listen: number
  /** Reaction to speech energy, emitted from the centre. */
  speak: number
  /** Internal travel of particles along curved paths. */
  activity: number
  /** Overall luminance. */
  glow: number
}

const base: OrbParams = {
  scale: 1,
  spin: 0.035,
  breath: 0.014,
  converge: 0,
  organize: 0,
  depth: 0.25,
  violet: 0.1,
  listen: 0,
  speak: 0,
  activity: 0,
  glow: 1,
}

export const ORB_STATES: Record<PresenceState, OrbParams> = {
  idle: base,
  listening: { ...base, scale: 1.05, spin: 0.028, breath: 0.008, listen: 1, glow: 1.12, violet: 0.05 },
  understanding: { ...base, spin: 0.05, converge: 0.07, organize: 1, depth: 0.5, violet: 0.22, glow: 1.08 },
  thinking: { ...base, spin: 0.06, converge: 0.03, organize: 0.45, depth: 1, violet: 0.65, activity: 1, glow: 1.05 },
  speaking: { ...base, spin: 0.04, speak: 1, violet: 0.18, depth: 0.4, glow: 1.12 },
  working: { ...base, spin: 0.05, converge: 0.04, organize: 0.8, depth: 0.6, violet: 0.32, activity: 0.55, glow: 1.05 },
  waiting: { ...base, spin: 0.025, breath: 0.012, glow: 0.88 },
}

export const PARAM_KEYS = Object.keys(base) as (keyof OrbParams)[]

/** Time constant (seconds) for state morphs: ~1s to settle, no overshoot. */
export const MORPH_TAU = 0.32
