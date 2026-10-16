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
  DrawGraphAction,
  MarkImageAction,
  HighlightTextAction,
  CopyFigureAction,
  DrawPulleyAction,
  DrawMassAction,
  DrawStringAction,
  DrawApparatusAction,
  DrawInclineAction,
  DrawOnInclineAction,
  DrawLineAction,
  FocusCameraAction,
  PlotFunctionAction,
  UpdateObjectPatch,
  UpdateGraphAction,
  UpdatePlotAction,
  WriteEquationAction,
  WriteTextAction,
} from "./protocol"

export type FakeAdapterCall =
  | { method: "updatePlot"; action: UpdatePlotAction }
  | { method: "createShape"; action: CreateShapeAction }
  | { method: "createFreehandPath"; action: CreateFreehandPathAction }
  | { method: "createPolygon"; action: CreatePolygonAction }
  | { method: "drawLine"; action: DrawLineAction }
  | { method: "drawArrow"; action: DrawArrowAction }
  | { method: "writeText"; action: WriteTextAction }
  | { method: "writeEquation"; action: WriteEquationAction }
  | { method: "plotFunction"; action: PlotFunctionAction }
  | { method: "drawGraph"; action: DrawGraphAction }
  | { method: "updateGraph"; action: UpdateGraphAction }
  | { method: "markImage"; action: MarkImageAction }
  | { method: "highlightText"; action: HighlightTextAction }
  | { method: "copyFigure"; action: CopyFigureAction }
  | { method: "drawPulley"; action: DrawPulleyAction }
  | { method: "drawMass"; action: DrawMassAction }
  | { method: "drawString"; action: DrawStringAction }
  | { method: "drawApparatus"; action: DrawApparatusAction }
  | { method: "drawIncline"; action: DrawInclineAction }
  | { method: "drawOnIncline"; action: DrawOnInclineAction }
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
  updatePlot(action: UpdatePlotAction): void { this.record({ method: "updatePlot", action }) }
  readonly calls: FakeAdapterCall[] = []
  /** Unset by default; tests may install one to observe the engine's authoring scope. */
  authored?: <T>(fn: () => T) => T
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

  drawGraph(action: DrawGraphAction): void {
    this.record({ method: "drawGraph", action })
    this.bounds.set(action.id, { x: action.position.x, y: action.position.y, w: action.w ?? 520, h: action.h ?? 380 })
  }

  updateGraph(action: UpdateGraphAction): void {
    this.record({ method: "updateGraph", action })
  }

  markImage(action: MarkImageAction): void {
    this.record({ method: "markImage", action })
    const [ymin, xmin, ymax, xmax] = action.box
    this.bounds.set(action.id, { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin })
  }

  drawApparatus(action: DrawApparatusAction): void {
    this.record({ method: "drawApparatus", action })
    const h = action.height ?? 180
    const at = action.position ?? { x: 0, y: 0 }
    this.bounds.set(action.id, { x: at.x, y: at.y, w: h * 0.8, h })
  }

  /** Slopes recorded by drawIncline, inherited by objects placed on them - as the real adapter does. */
  private readonly slopes = new Map<string, { drawnAngle: number; downhill: "left" | "right" }>()

  drawIncline(action: DrawInclineAction): void {
    this.record({ method: "drawIncline", action })
    const base = action.base ?? 400
    this.bounds.set(action.id, { x: action.position.x, y: action.position.y, w: base, h: base * 0.3 })
    this.slopes.set(action.id, { drawnAngle: Math.max(action.angle, 15), downhill: action.downhill })
  }

  drawOnIncline(action: DrawOnInclineAction): void {
    this.record({ method: "drawOnIncline", action })
    const slope = this.bounds.get(action.incline)
    if (!slope) throw new Error(`Unknown incline "${action.incline}"`)
    this.bounds.set(action.id, { x: slope.x + slope.w / 2, y: slope.y, w: action.w ?? 90, h: action.h ?? 45 })
    const s = this.slopes.get(action.incline)
    if (s) this.slopes.set(action.id, s)
  }

  getObjectSlope(id: string) {
    return this.slopes.get(id)
  }

  highlightText(action: HighlightTextAction): void {
    this.record({ method: "highlightText", action })
    this.bounds.set(action.id, { x: 0, y: 0, w: 100, h: 20 })
  }

  copyFigure(action: CopyFigureAction): void {
    this.record({ method: "copyFigure", action })
    const w = action.width ?? 400
    this.bounds.set(action.id, { x: action.position.x, y: action.position.y, w, h: w })
    for (const part of action.parts ?? []) {
      this.bounds.set(part.id, { x: action.position.x, y: action.position.y, w: 40, h: 40 })
      if (part.slope) this.slopes.set(part.id, { drawnAngle: part.slope.angle, downhill: part.slope.downhill })
    }
  }

  drawPulley(action: DrawPulleyAction): void {
    this.record({ method: "drawPulley", action })
    const c = action.centre ?? { x: 0, y: 0 }
    const r = action.radius ?? 26
    this.bounds.set(action.id, { x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r })
  }

  drawMass(action: DrawMassAction): void {
    this.record({ method: "drawMass", action })
    const at = action.position ?? { x: 0, y: 0 }
    const s = action.size ?? 44
    this.bounds.set(action.id, { x: at.x, y: at.y, w: s, h: s })
  }

  drawString(action: DrawStringAction): void {
    this.record({ method: "drawString", action })
    this.bounds.set(action.id, { x: 0, y: 0, w: 1, h: 1 })
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
