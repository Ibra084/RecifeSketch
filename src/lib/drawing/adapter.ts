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
  DrawingColor,
  FocusCameraAction,
  PlotFunctionAction,
  Region,
  UpdateObjectPatch,
  UpdateGraphAction,
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
  /** A live Desmos graph, plotted from its equations. */
  drawGraph(action: DrawGraphAction): void
  updateGraph(action: UpdateGraphAction): void
  /** A box/circle/underline inside the image the model was shown (see setImageRegion). */
  markImage(action: MarkImageAction): void
  /** Printed words in that image, highlighted on their exact (OCR) pixel boxes. */
  highlightText(action: HighlightTextAction): void
  /** A figure copied exactly out of the question image, with named parts as anchors. */
  copyFigure(action: CopyFigureAction): void
  /** A pulley wheel and its support. */
  drawPulley(action: DrawPulleyAction): void
  /** A block or particle, possibly hanging from a pulley. */
  drawMass(action: DrawMassAction): void
  /** A string joining two objects, possibly over a pulley, meeting each exactly. */
  drawString(action: DrawStringAction): void
  /** A piece of lab apparatus from the kit, as editable shapes. */
  drawApparatus(action: DrawApparatusAction): void
  /** A slope from its angle and downhill direction, with the angle marked. */
  drawIncline(action: DrawInclineAction): void
  /** An object resting on a slope, tilted to match. */
  drawOnIncline(action: DrawOnInclineAction): void
  /** The slope an object is (or rests on), for slope-relative force directions. */
  getObjectSlope?(id: string): { drawnAngle: number; downhill: "left" | "right" } | undefined
  /** Where on the board the image the model was shown sits, for mark_image. Null when there is none. */
  setImageRegion?(region: ObjectBounds | null): void

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
