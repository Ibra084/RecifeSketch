/**
 * The playback state machine.
 *
 * Plays a `DrawingSequence` one action at a time against the Phase 2
 * `DrawingEngine` (so every object is committed - real, permanent, and
 * fully editable - the instant it's created) and, on top of that,
 * optionally asks a `ShapeAnimator` to play a short reveal for the
 * action that was just committed. Because the real object already
 * exists before its animation starts, cancelling mid-animation can
 * never leave a half-formed object behind.
 *
 * Pausing and cancellation are only ever checked at safe boundaries -
 * before an action starts, and before an inter-step pause - never in
 * the middle of committing or animating one, so the board is always in
 * a consistent state when playback stops.
 */

import type { DrawingEngine } from "../engine"
import type { DrawingAction } from "../protocol"
import { curveToLine, repeatedCurveToLine } from "../curves"
import type { AnimationContext, ShapeAnimator } from "./animator"
import { NullShapeAnimator } from "./animator"
import { wait } from "./scheduler"
import { REALTIME_CLOCK, type DrawingSequence, type PlaybackClock, type PlaybackSnapshot, type PlaybackState } from "./types"

const MIN_SPEED = 0.25
const MAX_SPEED = 4
const DEFAULT_STEP_PAUSE_MS = 400
const DEFAULT_ACTION_DURATION_MS = 500

export interface DrawingPlayerOptions {
  engine: DrawingEngine
  animator?: ShapeAnimator
  baseStepPauseMs?: number
  baseActionDurationMs?: number
  speed?: number
  clock?: PlaybackClock
}

export class DrawingPlayer {
  private readonly engine: DrawingEngine
  private readonly animator: ShapeAnimator
  private readonly baseStepPauseMs: number
  private readonly baseActionDurationMs: number
  private readonly clock: PlaybackClock
  private speed: number

  private state: PlaybackState = "idle"
  private stepIndex = 0
  private totalSteps = 0
  private actionIndex = 0
  private totalActions = 0
  private error: PlaybackSnapshot["error"]

  private abortController: AbortController | null = null
  private cancelled = false
  private resolvePauseGate: (() => void) | null = null
  private readonly listeners = new Set<(snapshot: PlaybackSnapshot) => void>()

  constructor(options: DrawingPlayerOptions) {
    this.engine = options.engine
    this.animator = options.animator ?? new NullShapeAnimator()
    this.baseStepPauseMs = options.baseStepPauseMs ?? DEFAULT_STEP_PAUSE_MS
    this.baseActionDurationMs = options.baseActionDurationMs ?? DEFAULT_ACTION_DURATION_MS
    this.clock = options.clock ?? REALTIME_CLOCK
    this.speed = clampSpeed(options.speed ?? 1)
  }

  getSnapshot(): PlaybackSnapshot {
    return {
      state: this.state,
      stepIndex: this.stepIndex,
      totalSteps: this.totalSteps,
      actionIndex: this.actionIndex,
      totalActions: this.totalActions,
      speed: this.speed,
      error: this.error,
    }
  }

  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setSpeed(multiplier: number): void {
    this.speed = clampSpeed(multiplier)
  }

  pause(): void {
    if (this.state !== "drawing") return
    this.setState("paused")
  }

  resume(): void {
    if (this.state !== "paused") return
    this.setState("drawing")
    this.resolvePauseGate?.()
  }

  cancel(): void {
    if (this.state === "idle" || this.state === "completed" || this.state === "cancelled" || this.state === "error") {
      return
    }
    this.cancelled = true
    this.abortController?.abort()
    this.resolvePauseGate?.()
  }

  async play(sequence: DrawingSequence): Promise<void> {
    if (this.state !== "idle") {
      throw new Error("A DrawingPlayer instance can only play one sequence - create a new one to replay")
    }

    this.totalSteps = sequence.length
    this.totalActions = sequence.reduce((sum, step) => sum + step.actions.length, 0)
    this.abortController = new AbortController()

    this.setState("preparing")
    this.setState("drawing")

    for (let stepIndex = 0; stepIndex < sequence.length; stepIndex++) {
      await this.waitWhilePaused()
      if (this.cancelled) return this.setState("cancelled")
      this.stepIndex = stepIndex
      if (stepIndex > 0) this.emit()
      const step = sequence[stepIndex]

      for (const action of step.actions) {
        await this.waitWhilePaused()
        if (this.cancelled) return this.setState("cancelled")

        const result = this.engine.run([action])
        if (!result.ok) {
          this.error = {
            stepIndex,
            actionIndex: this.actionIndex,
            action: result.error!.action,
            message: result.error!.message,
          }
          return this.setState("error")
        }

        await this.animate(action)
        this.actionIndex++
        this.emit()
        if (this.cancelled) return this.setState("cancelled")
      }

      const isLastStep = stepIndex === sequence.length - 1
      if (!isLastStep) {
        await this.waitWhilePaused()
        if (this.cancelled) return this.setState("cancelled")

        const pauseMs = (step.pauseAfterMs ?? this.baseStepPauseMs) / this.speed
        await wait(pauseMs, this.abortController.signal, this.clock)
        if (this.cancelled) return this.setState("cancelled")
      }
    }

    this.setState("completed")
  }

  private async waitWhilePaused(): Promise<void> {
    while (this.state === "paused" && !this.cancelled) {
      await new Promise<void>((resolve) => {
        this.resolvePauseGate = resolve
      })
    }
    this.resolvePauseGate = null
  }

  private async animate(action: DrawingAction): Promise<void> {
    const ctx: AnimationContext = {
      signal: this.abortController!.signal,
      durationMs: this.baseActionDurationMs / this.speed,
    }

    switch (action.type) {
      case "draw_repeated_curve":
        return this.animator.revealLine(repeatedCurveToLine(action), ctx)
      case "draw_curve":
        return this.animator.revealLine(curveToLine(action), ctx)
      case "create_freehand_path":
        return this.animator.revealFreehand(action, ctx)
      case "create_polygon":
        return this.animator.revealPolygon(action, ctx)
      case "draw_line":
        return this.animator.revealLine(action, ctx)
      case "draw_arrow":
        return this.animator.revealArrow(action, ctx)
      case "create_shape":
        return this.animator.revealShape(action, ctx)
      case "write_text":
        return this.animator.revealText(action, ctx)
      case "write_equation":
        return this.animator.revealEquation(action, ctx)
      case "plot_function":
        return this.animator.revealPlot(action, ctx)
      case "focus_camera":
        return this.animator.focusCamera(action, ctx)
      default:
        return
    }
  }

  private setState(state: PlaybackState): void {
    this.state = state
    this.emit()
  }

  private emit(): void {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }
}

function clampSpeed(value: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, value))
}
