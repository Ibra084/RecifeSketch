/**
 * The tldraw-backed `ShapeAnimator`.
 *
 * Every method here assumes the Phase 2 `TldrawDrawingAdapter` has
 * *already* created the real, final shape for this action (the player
 * guarantees that ordering - see player.ts). These methods only ever
 * repeatedly `updateShape` that same shape, animating it from a "just
 * started" visual state up to the state it's already logically in, so
 * the object is permanent and fully editable throughout, never a
 * disposable animation-only proxy.
 *
 * Point-based reveals (freehand, polygon, line, the plotted curve) grow
 * a subset of the final points; this is the "precise stroke animation".
 * Shapes with no natural point sequence (geo primitives) get the safe
 * fallback required by the spec: an opacity fade-in. Text and equations
 * get a progressive character reveal, which reads as a pen writing.
 *
 * The number of intermediate frames is capped (`MAX_REVEAL_STEPS`) so a
 * very long stroke still only produces a bounded number of store writes,
 * never one write per point.
 */

import { createShapeId, toRichText, type Editor } from "tldraw"
import type {
  CreateFreehandPathAction,
  CreatePolygonAction,
  CreateShapeAction,
  DrawArrowAction,
  DrawLineAction,
  FocusCameraAction,
  PlotFunctionAction,
  WriteEquationAction,
  WriteTextAction,
} from "../protocol"
import { mapPointsToCanvas, sampleFunction } from "../plotting"
import { buildDrawSegments, buildLinePointsRecord, type PlainPoint } from "../tldraw-shape-builders"
import type { AnimationContext, ShapeAnimator } from "./animator"
import { runSteppedAnimation } from "./scheduler"
import { REALTIME_CLOCK, type PlaybackClock } from "./types"

const MAX_REVEAL_STEPS = 24
const CAMERA_MOVE_THRESHOLD_PX = 8

function stepsFor(pointCount: number): number {
  return Math.max(1, Math.min(MAX_REVEAL_STEPS, pointCount))
}

function subsetCount(total: number, frameIndex: number, steps: number, isFinal: boolean): number {
  if (isFinal) return total
  return Math.max(2, Math.round(((frameIndex + 1) / steps) * total))
}

export class TldrawShapeAnimator implements ShapeAnimator {
  constructor(
    private readonly editor: Editor,
    private readonly clock: PlaybackClock = REALTIME_CLOCK
  ) {}

  async revealFreehand(action: CreateFreehandPathAction, ctx: AnimationContext): Promise<void> {
    const tlId = createShapeId(action.id)
    const total = action.points.length
    const steps = stepsFor(total)

    await runSteppedAnimation({
      steps,
      durationMs: ctx.durationMs,
      signal: ctx.signal,
      clock: this.clock,
      onFrame: (frameIndex, isFinal) => {
        const count = subsetCount(total, frameIndex, steps, isFinal)
        this.editor.updateShape({
          id: tlId,
          type: "draw",
          props: { segments: buildDrawSegments(action.points.slice(0, count), "free") },
        })
      },
    })
  }

  async revealPolygon(action: CreatePolygonAction, ctx: AnimationContext): Promise<void> {
    const tlId = createShapeId(action.id)
    const total = action.points.length
    const steps = stepsFor(total)

    await runSteppedAnimation({
      steps,
      durationMs: ctx.durationMs,
      signal: ctx.signal,
      clock: this.clock,
      onFrame: (frameIndex, isFinal) => {
        const count = subsetCount(total, frameIndex, steps, isFinal)
        this.editor.updateShape({
          id: tlId,
          type: "draw",
          props: {
            segments: buildDrawSegments(action.points.slice(0, count), "straight"),
            isClosed: isFinal,
          },
        })
      },
    })
  }

  async revealLine(action: DrawLineAction, ctx: AnimationContext): Promise<void> {
    const tlId = createShapeId(action.id)
    await this.revealLinePoints(tlId, action.points, ctx)
  }

  async revealPlot(action: PlotFunctionAction, ctx: AnimationContext): Promise<void> {
    const tlId = createShapeId(action.id)
    const position = action.position ?? { x: 0, y: 0 }
    const scale = action.scale ?? { x: 40, y: 40 }
    const samples = sampleFunction(action.expression, action.domain, action.samples ?? 100)
    const points = mapPointsToCanvas(samples, { position, scale })
    await this.revealLinePoints(tlId, points, ctx)
  }

  private async revealLinePoints(
    tlId: ReturnType<typeof createShapeId>,
    points: readonly PlainPoint[],
    ctx: AnimationContext
  ): Promise<void> {
    const total = points.length
    const steps = stepsFor(total)

    await runSteppedAnimation({
      steps,
      durationMs: ctx.durationMs,
      signal: ctx.signal,
      clock: this.clock,
      onFrame: (frameIndex, isFinal) => {
        const count = subsetCount(total, frameIndex, steps, isFinal)
        this.editor.updateShape({
          id: tlId,
          type: "line",
          props: { points: buildLinePointsRecord(points.slice(0, count)) },
        })
      },
    })
  }

  async revealArrow(action: DrawArrowAction, ctx: AnimationContext): Promise<void> {
    const tlId = createShapeId(action.id)
    const steps = MAX_REVEAL_STEPS

    await runSteppedAnimation({
      steps,
      durationMs: ctx.durationMs,
      signal: ctx.signal,
      clock: this.clock,
      onFrame: (frameIndex, isFinal) => {
        const t = isFinal ? 1 : (frameIndex + 1) / steps
        const end = isFinal
          ? action.end
          : {
              x: action.start.x + (action.end.x - action.start.x) * t,
              y: action.start.y + (action.end.y - action.start.y) * t,
            }
        this.editor.updateShape({ id: tlId, type: "arrow", props: { end } })
      },
    })
  }

  /** Safe fallback for primitives with no natural point sequence: opacity fade-in. */
  async revealShape(action: CreateShapeAction, ctx: AnimationContext): Promise<void> {
    await this.fadeIn(createShapeId(action.id), "geo", ctx)
  }

  async revealText(action: WriteTextAction, ctx: AnimationContext): Promise<void> {
    await this.typeText(createShapeId(action.id), action.text, ctx)
  }

  async revealEquation(action: WriteEquationAction, ctx: AnimationContext): Promise<void> {
    await this.typeText(createShapeId(action.id), action.expression, ctx)
  }

  private async fadeIn(
    tlId: ReturnType<typeof createShapeId>,
    type: "geo" | "text" | "arrow" | "draw" | "line",
    ctx: AnimationContext
  ): Promise<void> {
    const steps = MAX_REVEAL_STEPS
    await runSteppedAnimation({
      steps,
      durationMs: ctx.durationMs,
      signal: ctx.signal,
      clock: this.clock,
      onFrame: (frameIndex, isFinal) => {
        const opacity = isFinal ? 1 : (frameIndex + 1) / steps
        this.editor.updateShape({ id: tlId, type, opacity })
      },
    })
  }

  private async typeText(
    tlId: ReturnType<typeof createShapeId>,
    text: string,
    ctx: AnimationContext
  ): Promise<void> {
    const total = text.length
    const steps = stepsFor(total)

    await runSteppedAnimation({
      steps,
      durationMs: ctx.durationMs,
      signal: ctx.signal,
      clock: this.clock,
      onFrame: (frameIndex, isFinal) => {
        const count = isFinal ? total : Math.max(1, Math.round(((frameIndex + 1) / steps) * total))
        this.editor.updateShape({
          id: tlId,
          type: "text",
          props: { richText: toRichText(text.slice(0, count)) },
        })
      },
    })
  }

  async focusCamera(action: FocusCameraAction, ctx: AnimationContext): Promise<void> {
    const target = action.target
    const durationMs = Math.round(ctx.durationMs)

    if (target.kind === "bounds") {
      this.editor.zoomToBounds(target.region, { animation: { duration: durationMs } })
      return
    }

    const currentCenter = this.editor.getViewportPageBounds().center
    const dx = currentCenter.x - target.position.x
    const dy = currentCenter.y - target.position.y
    const movedFar = Math.hypot(dx, dy) > CAMERA_MOVE_THRESHOLD_PX

    if (movedFar) {
      this.editor.centerOnPoint(target.position, { animation: { duration: durationMs } })
    }
    if (target.zoom !== undefined) {
      const camera = this.editor.getCamera()
      if (Math.abs(camera.z - target.zoom) > 0.001) {
        this.editor.setCamera({ ...camera, z: target.zoom }, { animation: { duration: durationMs } })
      }
    }
  }
}
