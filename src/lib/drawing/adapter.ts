/**
 * The adapter seam between the execution engine and a concrete renderer.
 *
 * The engine (engine.ts) only ever talks to this interface - it never
 * imports tldraw. `tldraw-adapter.ts` implements it against a real tldraw
 * `Editor`; `fake-adapter.ts` implements it in memory for tests and the
 * dev harness's dry-run mode.
 */

import type {
  CreateFreehandPathAction,
  CreatePolygonAction,
  CreateShapeAction,
  DrawArrowAction,
  DrawLineAction,
  DrawingColor,
  FocusCameraAction,
  PlotFunctionAction,
  Region,
  UpdateObjectPatch,
  UpdatePlotAction,
  WriteEquationAction,
  WriteTextAction,
} from "./protocol"
import type { ObjectFrame } from "./force-geometry"

export interface ObjectBounds {
  x: number
  y: number
  w: number
  h: number
}

export interface HighlightOptions {
  color: DrawingColor
  visible: boolean
}

export interface DrawingAdapter {
  createShape(action: CreateShapeAction): void
  createFreehandPath(action: CreateFreehandPathAction): void
  createPolygon(action: CreatePolygonAction): void
  drawLine(action: DrawLineAction): void
  drawArrow(action: DrawArrowAction): void
  writeText(action: WriteTextAction): void
  writeEquation(action: WriteEquationAction): void
  plotFunction(action: PlotFunctionAction): void
  updatePlot(action: UpdatePlotAction): void

  moveObject(id: string, position: { x: number; y: number }): void
  updateObject(id: string, patch: UpdateObjectPatch): void
  deleteObject(id: string): void
  highlightObject(id: string, options: HighlightOptions): void

  /** Deletes every tracked object intersecting `region`; returns their ids. */
  clearRegion(region: Region): string[]

  focusCamera(target: FocusCameraAction["target"]): void

  /** Bounds of a previously-created object, if the adapter can report them. */
  getObjectBounds(id: string): ObjectBounds | undefined

  /** Optional: centre, unturned size, turn and outline of an object, for exact force arrows. Falls back to its bounds. */
  getObjectFrame?(id: string): ObjectFrame | undefined

  /**
   * Optional: run `fn` as AI authoring, so anything it creates can be
   * marked as the tutor's rather than the student's.
   */
  authored?<T>(fn: () => T): T
}
