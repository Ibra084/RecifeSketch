/**
 * The execution engine.
 *
 * Takes a validated, ordered list of drawing actions and plays them
 * against a `DrawingAdapter`, one at a time, in the exact order given
 * (deterministic execution order). Before touching any action that
 * carries an `id`, it asks the adapter whether that id is *actually*
 * still alive (`getObjectBounds(id) !== undefined`) rather than trusting
 * its own history of what it created - a `create_*` action is rejected
 * only if a live object already holds that id, and every other action
 * that references an id is rejected unless a live object holds it.
 *
 * Checking liveness this way, instead of keeping a private "ids I've
 * created" set, is what makes the whole system self-healing when a
 * student deletes or replaces an AI-created object directly on the
 * canvas: the moment the backing object is gone, its id is simply gone
 * too, with no separate bookkeeping to fall out of sync.
 *
 * This module never imports tldraw - it only knows the `DrawingAdapter`
 * interface, so it can be fully unit tested against the in-memory
 * `FakeDrawingAdapter`.
 */

import type { DrawingAdapter } from "./adapter"
import { drawingProgramSchema, type DrawingAction } from "./protocol"
import { curveToLine, repeatedCurveToLine } from "./curves"

export interface ExecutedAction {
  index: number
  action: DrawingAction
}

export interface DrawingRunError {
  index: number
  action: DrawingAction
  message: string
}

export interface DrawingExecutionResult {
  stage: "execution"
  ok: boolean
  executed: ExecutedAction[]
  error?: DrawingRunError
}

export interface DrawingValidationFailure {
  stage: "validation"
  ok: false
  issues: { path: string; message: string }[]
}

export type DrawingRunResult = DrawingExecutionResult | DrawingValidationFailure

const CREATING_TYPES = new Set<DrawingAction["type"]>([
  "create_shape",
  "create_freehand_path",
  "create_polygon",
  "draw_line",
  "draw_arrow",
  "draw_curve",
  "draw_repeated_curve",
  "write_text",
  "write_equation",
  "plot_function",
])

export class DrawingEngine {
  constructor(private readonly adapter: DrawingAdapter) {}

  /** Executes already-validated actions in order. Stops at the first error. */
  run(actions: DrawingAction[]): DrawingExecutionResult {
    const executed: ExecutedAction[] = []

    for (let index = 0; index < actions.length; index++) {
      const action = actions[index]
      try {
        this.execute(action)
      } catch (error) {
        return {
          stage: "execution",
          ok: false,
          executed,
          error: {
            index,
            action,
            message: error instanceof Error ? error.message : String(error),
          },
        }
      }
      executed.push({ index, action })
    }

    return { stage: "execution", ok: true, executed }
  }

  private execute(action: DrawingAction): void {
    if ("id" in action) {
      const alive = this.adapter.getObjectBounds(action.id) !== undefined
      if (CREATING_TYPES.has(action.type)) {
        if (alive) throw new Error(`Object id "${action.id}" already exists`)
      } else if (!alive) {
        throw new Error(`Unknown id "${action.id}": no object with this id exists`)
      }
    }

    switch (action.type) {
      case "update_plot":
        this.adapter.updatePlot(action)
        return
      case "draw_repeated_curve":
        this.adapter.drawLine(repeatedCurveToLine(action))
        return
      case "draw_curve":
        this.adapter.drawLine(curveToLine(action))
        return
      case "create_shape":
        this.adapter.createShape(action)
        return
      case "create_freehand_path":
        this.adapter.createFreehandPath(action)
        return
      case "create_polygon":
        this.adapter.createPolygon(action)
        return
      case "draw_line":
        this.adapter.drawLine(action)
        return
      case "draw_arrow":
        this.adapter.drawArrow(action)
        return
      case "write_text":
        this.adapter.writeText(action)
        return
      case "write_equation":
        this.adapter.writeEquation(action)
        return
      case "plot_function":
        this.adapter.plotFunction(action)
        return

      case "move_object":
        this.adapter.moveObject(action.id, action.position)
        return
      case "update_object":
        this.adapter.updateObject(action.id, action.patch)
        return
      case "delete_object":
        this.adapter.deleteObject(action.id)
        return
      case "highlight_object":
        this.adapter.highlightObject(action.id, {
          color: action.color ?? "yellow",
          visible: action.visible ?? true,
        })
        return

      case "clear_region":
        this.adapter.clearRegion(action.region)
        return
      case "focus_camera":
        this.adapter.focusCamera(action.target)
        return
    }
  }
}

/**
 * Validates `rawProgram` against the drawing protocol and, if valid, runs
 * it against `adapter`. This is the single entry point a caller (the dev
 * harness today, an AI tool-call handler later) should use - it never
 * trusts unvalidated input to reach the engine.
 */
export function runDrawingProgram(adapter: DrawingAdapter, rawProgram: unknown): DrawingRunResult {
  const parsed = drawingProgramSchema.safeParse(rawProgram)

  if (!parsed.success) {
    return {
      stage: "validation",
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    }
  }

  return new DrawingEngine(adapter).run(parsed.data)
}
