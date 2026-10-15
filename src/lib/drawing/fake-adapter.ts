/**
 * An in-memory `DrawingAdapter`. Used by the engine's unit tests (so engine
 * behavior can be verified without a real tldraw `Editor`/DOM) and by the
 * dev harness's "dry run" mode, where a developer wants to see what the
 * engine would do without touching the live board.
 */

import type { DrawingAdapter, HighlightOptions, ObjectBounds } from "./adapter"
import type {
  ClearRegionAction,
  CreateFreehandPathAction,
  CreatePolygonAction,
  CreateShapeAction,
  DrawArrowAction,
  DrawLineAction,
  FocusCameraAction,
  PlotFunctionAction,
  UpdateObjectPatch,
  WriteEquationAction,
  WriteTextAction,
} from "./protocol"

export type FakeAdapterCall =
  | { method: "createShape"; action: CreateShapeAction }
  | { method: "createFreehandPath"; action: CreateFreehandPathAction }
  | { method: "createPolygon"; action: CreatePolygonAction }
  | { method: "drawLine"; action: DrawLineAction }
  | { method: "drawArrow"; action: DrawArrowAction }
  | { method: "writeText"; action: WriteTextAction }
  | { method: "writeEquation"; action: WriteEquationAction }
  | { method: "plotFunction"; action: PlotFunctionAction }
  | { method: "moveObject"; id: string; position: { x: number; y: number } }
  | { method: "updateObject"; id: string; patch: UpdateObjectPatch }
  | { method: "deleteObject"; id: string }
  | { method: "highlightObject"; id: string; options: HighlightOptions }
  | { method: "clearRegion"; region: ClearRegionAction["region"] }
  | { method: "focusCamera"; target: FocusCameraAction["target"] }

function boundsOfPoints(points: readonly { x: number; y: number }[]): ObjectBounds {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX || 1, h: Math.max(...ys) - minY || 1 }
}

export class FakeDrawingAdapter implements DrawingAdapter {
  readonly calls: FakeAdapterCall[] = []
  private readonly bounds = new Map<string, ObjectBounds>()
  /** Ids that `clearRegion` should report as deleted on its next call. */
  nextClearRegionResult: string[] = []

  private record(call: FakeAdapterCall) {
    this.calls.push(call)
  }

  /**
   * Test-only hook that models an object disappearing without going
   * through `deleteObject` - e.g. a student deleting an AI-created shape
   * directly on the canvas. Real tldraw usage needs no such hook: its
   * `getObjectBounds` already reflects live editor state on every call.
   */
  simulateExternalRemoval(id: string): void {
    this.bounds.delete(id)
  }

  createShape(action: CreateShapeAction): void {
    this.record({ method: "createShape", action })
    this.bounds.set(action.id, { x: action.x, y: action.y, w: action.w, h: action.h })
  }

  createFreehandPath(action: CreateFreehandPathAction): void {
    this.record({ method: "createFreehandPath", action })
    this.bounds.set(action.id, boundsOfPoints(action.points))
  }

  createPolygon(action: CreatePolygonAction): void {
    this.record({ method: "createPolygon", action })
    this.bounds.set(action.id, boundsOfPoints(action.points))
  }

  drawLine(action: DrawLineAction): void {
    this.record({ method: "drawLine", action })
    this.bounds.set(action.id, boundsOfPoints(action.points))
  }

  drawArrow(action: DrawArrowAction): void {
    this.record({ method: "drawArrow", action })
    this.bounds.set(action.id, boundsOfPoints([action.start, action.end]))
  }

  writeText(action: WriteTextAction): void {
    this.record({ method: "writeText", action })
    this.bounds.set(action.id, { x: action.position.x, y: action.position.y, w: action.w ?? 100, h: 20 })
  }

  writeEquation(action: WriteEquationAction): void {
    this.record({ method: "writeEquation", action })
    this.bounds.set(action.id, { x: action.position.x, y: action.position.y, w: 100, h: 20 })
  }

  plotFunction(action: PlotFunctionAction): void {
    this.record({ method: "plotFunction", action })
    const position = action.position ?? { x: 0, y: 0 }
    this.bounds.set(action.id, { x: position.x, y: position.y, w: 100, h: 100 })
  }

  moveObject(id: string, position: { x: number; y: number }): void {
    this.record({ method: "moveObject", id, position })
    const existing = this.bounds.get(id)
    if (existing) this.bounds.set(id, { ...existing, x: position.x, y: position.y })
  }

  updateObject(id: string, patch: UpdateObjectPatch): void {
    this.record({ method: "updateObject", id, patch })
  }

  deleteObject(id: string): void {
    this.record({ method: "deleteObject", id })
    this.bounds.delete(id)
  }

  highlightObject(id: string, options: HighlightOptions): void {
    this.record({ method: "highlightObject", id, options })
  }

  clearRegion(region: ClearRegionAction["region"]): string[] {
    this.record({ method: "clearRegion", region })
    const result = this.nextClearRegionResult
    this.nextClearRegionResult = []
    for (const id of result) this.bounds.delete(id)
    return result
  }

  focusCamera(target: FocusCameraAction["target"]): void {
    this.record({ method: "focusCamera", target })
  }

  getObjectBounds(id: string): ObjectBounds | undefined {
    return this.bounds.get(id)
  }
}
