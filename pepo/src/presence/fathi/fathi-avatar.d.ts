/** Types for FATHI's original renderer (fathi-avatar.js, kept exactly as exported). */

export type FathiState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'processing'
  | 'speaking'
  | 'tool'
  | 'tool-active'
  | 'error'
  | 'muted'
  | 'offline'

export interface FathiAvatar {
  readonly particleCount: number
  start(): void
  stop(): void
  resize(): void
  setReduced(reduced: boolean): void
  setState(state: FathiState): void
  setAmplitude(level: number): void
  setSpectrum(bands: ArrayLike<number>): void
  setFormants(openness: number | null, frontness: number | null): void
  setPointer(x: number, y: number, active?: boolean): void
  gesture(name: string): boolean
  triggerBlink(): boolean
  dispose(): void
}

/** The motion controller interface FATHI's renderer drives each frame. */
export interface FathiMotionController {
  setState(state: string): void
  setAmplitude(level: number): void
  setSpectrum(bands: ArrayLike<number>): void
  setFormants(openness: number | null, frontness: number | null): void
  setVitality(level: string): string
  setPointer(x: number, y: number, active?: boolean): void
  setReduced(reduced: boolean): void
  blink(): boolean
  gesture(name: string): boolean
  step(dt: number): unknown
  readonly motion: unknown
}

export function createFathiAvatar(
  canvas: HTMLCanvasElement,
  opts?: {
    motion?: boolean
    inspection?: boolean
    tier?: 'high' | 'medium' | 'low'
    /** Drives the rig instead of FATHI's own controller (the one line PEPO added to fathi-avatar.js). */
    controller?: FathiMotionController
  },
): Promise<FathiAvatar>
