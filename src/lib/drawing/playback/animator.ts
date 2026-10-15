/**
 * The seam between the player's state machine and however a single
 * action is actually drawn on screen. `TldrawShapeAnimator` implements
 * this against a real tldraw `Editor`; `NullShapeAnimator` is the default
 * used by tests and by any caller that just wants instant drawing with
 * no animation.
 *
 * Every method receives the full, already-committed `DrawingAction` (the
 * real object already exists via the Phase 2 engine by the time these
 * run) plus an `AnimationContext`. Implementations must respect
 * `ctx.signal`: once aborted, they should settle immediately, leaving the
 * object in its correct final state (never half-drawn).
 */

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

export interface AnimationContext {
  signal: AbortSignal
  /** Base duration for this action, already scaled by the player's speed setting. */
  durationMs: number
}

export interface ShapeAnimator {
  revealFreehand(action: CreateFreehandPathAction, ctx: AnimationContext): Promise<void>
  revealPolygon(action: CreatePolygonAction, ctx: AnimationContext): Promise<void>
  revealLine(action: DrawLineAction, ctx: AnimationContext): Promise<void>
  revealArrow(action: DrawArrowAction, ctx: AnimationContext): Promise<void>
  revealShape(action: CreateShapeAction, ctx: AnimationContext): Promise<void>
  revealText(action: WriteTextAction, ctx: AnimationContext): Promise<void>
  revealEquation(action: WriteEquationAction, ctx: AnimationContext): Promise<void>
  revealPlot(action: PlotFunctionAction, ctx: AnimationContext): Promise<void>
  focusCamera(action: FocusCameraAction, ctx: AnimationContext): Promise<void>
}

/** Does nothing - every object simply appears in its final state instantly. */
export class NullShapeAnimator implements ShapeAnimator {
  async revealFreehand(): Promise<void> {}
  async revealPolygon(): Promise<void> {}
  async revealLine(): Promise<void> {}
  async revealArrow(): Promise<void> {}
  async revealShape(): Promise<void> {}
  async revealText(): Promise<void> {}
  async revealEquation(): Promise<void> {}
  async revealPlot(): Promise<void> {}
  async focusCamera(): Promise<void> {}
}
