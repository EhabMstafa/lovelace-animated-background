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
  gesture(name: 'nod' | 'agree' | 'consider' | 'emphasis' | 'lookLeft' | 'lookRight'): boolean
  triggerBlink(): boolean
  dispose(): void
}

export function createFathiAvatar(
  canvas: HTMLCanvasElement,
  opts?: { motion?: boolean; inspection?: boolean; tier?: 'high' | 'medium' | 'low' },
): Promise<FathiAvatar>
