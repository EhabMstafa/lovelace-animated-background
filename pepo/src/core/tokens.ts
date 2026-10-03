/**
 * PEPO design tokens. Shared between CSS (via index.css custom properties)
 * and WebGL (via the linear RGB helpers below), so the Orb and the DOM
 * surfaces always speak the same color language.
 */

export const color = {
  space0: '#030812',
  space1: '#050B18',
  space2: '#071225',

  cyan: '#40E6FF',
  cyanSoft: '#4BC8FF',
  blue: '#3B82FF',
  blueDeep: '#276BFF',
  violet: '#8B5CFF',
  violetSoft: '#B066FF',

  textPrimary: '#EEF4FF',
  textSecondary: '#9BAAC3',
  textMuted: '#67738A',
} as const

/** Durations in milliseconds, see "Motion principles". */
export const duration = {
  micro: 180,
  surface: 360,
  orbMorph: 900,
  presenceTransform: 1500,
} as const

/** Physically plausible easing: fast start, long soft settle. No bounce. */
export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
}
