/**
 * Cancellable timing primitives for progressive playback. Framework- and
 * tldraw-agnostic, and driven through an injectable `PlaybackClock` so
 * tests never wait on real timers.
 */

import { REALTIME_CLOCK, type PlaybackClock } from "./types"

/** Resolves after `ms`, or immediately once `signal` aborts - never rejects. */
export function wait(ms: number, signal: AbortSignal, clock: PlaybackClock = REALTIME_CLOCK): Promise<void> {
  if (signal.aborted || ms <= 0) return Promise.resolve()

  return new Promise((resolve) => {
    const handle = clock.setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)

    function onAbort() {
      clock.clearTimeout(handle)
      resolve()
    }

    signal.addEventListener("abort", onAbort)
  })
}

export interface SteppedAnimationOptions {
  /** Number of discrete frames to render, at least 1. */
  steps: number
  durationMs: number
  signal: AbortSignal
  clock?: PlaybackClock
  /** Called once per frame with a 0-based index; `isFinal` is true only on the last call. */
  onFrame: (frameIndex: number, isFinal: boolean) => void
}

/**
 * Drives `onFrame` across `steps` evenly-spaced frames over `durationMs`.
 * If `signal` is already aborted, or aborts mid-run, it jumps straight to
 * a single final frame instead of unwinding partway - callers can always
 * assume the animated object ends in its correct, final state.
 */
export function runSteppedAnimation(options: SteppedAnimationOptions): Promise<void> {
  const { steps, durationMs, signal, onFrame } = options
  const clock = options.clock ?? REALTIME_CLOCK
  const lastIndex = Math.max(0, steps - 1)

  if (signal.aborted || steps <= 1) {
    onFrame(lastIndex, true)
    return Promise.resolve()
  }

  const intervalMs = durationMs / steps

  return new Promise((resolve) => {
    let settled = false
    let frame = 0
    let timerHandle: number

    function finishEarly() {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      clock.clearTimeout(timerHandle)
      onFrame(lastIndex, true)
      resolve()
    }

    function onAbort() {
      finishEarly()
    }

    function tick() {
      if (settled) return
      const isFinal = frame === lastIndex
      onFrame(frame, isFinal)
      if (isFinal) {
        settled = true
        signal.removeEventListener("abort", onAbort)
        resolve()
        return
      }
      frame++
      timerHandle = clock.setTimeout(tick, intervalMs)
    }

    signal.addEventListener("abort", onAbort)
    timerHandle = clock.setTimeout(tick, intervalMs)
  })
}
