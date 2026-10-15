/**
 * Types for the progressive playback layer.
 *
 * A `DrawingSequence` groups validated actions into `DrawingStep`s. Pauses
 * only ever happen *between* steps, never between actions inside the same
 * step - that's what keeps a shape and its label, say, visually
 * synchronized (requirement 6) while still giving the whole sequence a
 * teacher-like pace (requirement 5).
 */

import type { DrawingAction } from "../protocol"

export interface DrawingStep {
  actions: DrawingAction[]
  /** Pause after this step completes, before the next one starts. Defaults to the player's baseStepPauseMs. */
  pauseAfterMs?: number
}

export type DrawingSequence = DrawingStep[]

export type PlaybackState =
  | "idle"
  | "preparing"
  | "drawing"
  | "paused"
  | "completed"
  | "cancelled"
  | "error"

export interface PlaybackErrorInfo {
  stepIndex: number
  actionIndex: number
  action: DrawingAction
  message: string
}

export interface PlaybackSnapshot {
  state: PlaybackState
  /** Index of the step currently in flight (or about to start). */
  stepIndex: number
  totalSteps: number
  /** Cumulative action index across the whole sequence (0-based). */
  actionIndex: number
  totalActions: number
  speed: number
  error?: PlaybackErrorInfo
}

/** A clock seam so tests can run instantly instead of waiting on real timers. */
export interface PlaybackClock {
  now(): number
  setTimeout(callback: () => void, ms: number): number
  clearTimeout(handle: number): void
  requestFrame(callback: (time: number) => void): number
  cancelFrame(handle: number): void
}

export const REALTIME_CLOCK: PlaybackClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms) as unknown as number,
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  requestFrame: (callback) =>
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame(callback)
      : (globalThis.setTimeout(() => callback(Date.now()), 16) as unknown as number),
  cancelFrame: (handle) =>
    typeof cancelAnimationFrame === "function"
      ? cancelAnimationFrame(handle)
      : globalThis.clearTimeout(handle),
}
