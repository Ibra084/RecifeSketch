/**
 * The tldraw editor adapter.
 *
 * Implements `DrawingAdapter` against a real, mounted tldraw `Editor`,
 * translating each validated action into native tldraw shapes. Every
 * object the engine creates is tracked here under its external stable
 * id, mapped to the real `TLShapeId` tldraw assigned it (which is itself
 * derived deterministically from the external id via `createShapeId`, so
 * the same external id always maps to the same tldraw shape).
 *
 * Primitives tldraw has no native shape for are approximated with an
 * existing, fully editable shape type rather than a bespoke one:
 *  - a colored freehand pen stroke -> a `draw` shape with one `free` segment
 *  - an arbitrary polygon -> a closed `draw` shape with one `straight` segment
 *  - a plotted function curve -> a `line` shape through the sampled points
 * All three remain ordinary, selectable, editable tldraw shapes afterwards.
 */

import { createShapeId, getFontFamily, renderPlaintextFromRichText, toRichText, type Editor, type TLArrowShape, type TLShapeId } from "tldraw"
import type { DrawingAdapter, HighlightOptions, ObjectBounds } from "./adapter"
import { findContainingId } from "./geometry"
import { sanitizeMathNotation } from "./math-notation"
import { computeNiceTicks, mapPointsToCanvas, sampleFunction } from "./plotting"
import { buildDrawSegments, buildLinePointsRecord } from "./tldraw-shape-builders"
import { AttachedLabels } from "./attached-labels"
import type {
  ClearRegionAction,
  CreateFreehandPathAction,
  CreatePolygonAction,
  CreateShapeAction,
  DrawArrowAction,
  DrawingColor,
  DrawLineAction,
  FocusCameraAction,
  PlotFunctionAction,
  UpdateObjectPatch,
  UpdatePlotAction,
  WriteEquationAction,
  WriteTextAction,
} from "./protocol"
import { plotFunctionActionSchema } from "./protocol"

type TrackedKind = "geo" | "draw" | "line" | "arrow" | "text"

/** The vocabulary used in a board summary - finer-grained than `TrackedKind` (which collapses freehand/polygon into tldraw's "draw"). */
export type SummaryKind = "shape" | "freehand" | "polygon" | "line" | "arrow" | "text" | "equation" | "plot"

interface TrackedObject {
  tlId: TLShapeId
  kind: TrackedKind
  summaryKind: SummaryKind
  label?: string
}

/** A compact description of one AI-created object still live on the board. */
export interface TrackedObjectSummary {
  id: string
  kind: SummaryKind
  label?: string
  x: number
  y: number
  w: number
  h: number
  /** Ids of other known objects this one (usually an arrow) visually touches. */
  connects?: string[]
}

/** Mirrors `MAX_CONTEXT_OBJECTS` in src/lib/ai/context.ts - keep in sync. */
const MAX_TRACKED_OBJECT_SUMMARIES = 60

/** Formats a tick value for an axis label: short, and never "-0". */
function formatTickLabel(value: number): string {
  return value === 0 ? "0" : String(value)
}

function regionsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export class TldrawDrawingAdapter implements DrawingAdapter {
  private readonly objects = new Map<string, TrackedObject>()
  private readonly highlights = new Map<string, TLShapeId>()
  /** Scaffolding shapes (axis lines, tick marks, tick labels) that belong to a plot_function id but aren't independently addressable. */
  private readonly plotAuxiliaries = new Map<string, TLShapeId[]>()

  private readonly labels: AttachedLabels
  private readonly stopTracking: () => void

  constructor(private readonly editor: Editor) {
    this.labels = new AttachedLabels(editor)
    this.restoreTracked()
    this.stopTracking = editor.sideEffects.registerAfterCreateHandler("shape", shape => {
      const entry = [...this.objects.entries()].find(([, tracked]) => tracked.tlId === shape.id)
      if (entry) editor.updateShape({ id: shape.id, type: shape.type, meta: {
        ...shape.meta, recifeObjectId: entry[0], recifeKind: entry[1].summaryKind,
      } })
    })
  }

  dispose(): void { this.labels.dispose(); this.stopTracking() }

  private restoreTracked(): void {
    const kinds: SummaryKind[] = ["shape", "freehand", "polygon", "line", "arrow", "text", "equation", "plot"]
    for (const shape of this.editor.getCurrentPageShapes()) {
      const id = shape.meta.recifeObjectId
      const kind = shape.meta.recifeKind as SummaryKind
      if (typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id) && kinds.includes(kind) &&
        ["geo", "draw", "line", "arrow", "text"].includes(shape.type)) {
        this.objects.set(id, { tlId: shape.id, kind: shape.type as TrackedKind, summaryKind: kind })
      }
    }
  }

  private track(id: string, kind: TrackedKind, summaryKind: SummaryKind, label?: string): TLShapeId {
    const tlId = createShapeId(id)
    this.objects.set(id, { tlId, kind, summaryKind, ...(label ? { label } : {}) })
    return tlId
  }

  createShape(action: CreateShapeAction): void {
    const tlId = this.track(action.id, "geo", "shape", action.label)
    this.editor.createShapes([
      {
        id: tlId,
        type: "geo",
        x: action.x,
        y: action.y,
        props: {
          geo: action.shape,
          w: action.w,
          h: action.h,
          color: action.color ?? "black",
          fill: action.fill ?? "none",
          dash: action.dash ?? "draw",
          size: action.size ?? "m",
          richText: toRichText(""),
        },
      },
    ])
    if (action.label) this.labels.set(tlId, action.label, action.color)
  }

  createFreehandPath(action: CreateFreehandPathAction): void {
    const tlId = this.track(action.id, "draw", "freehand")
    const segments = buildDrawSegments(action.points, "free")
    this.editor.createShapes([
      {
        id: tlId,
        type: "draw",
        x: 0,
        y: 0,
        props: {
          segments,
          color: action.color ?? "black",
          size: action.size ?? "m",
          isComplete: true,
          isClosed: action.closed ?? false,
          isPen: false,
        },
      },
    ])
  }

  createPolygon(action: CreatePolygonAction): void {
    const tlId = this.track(action.id, "draw", "polygon")
    const segments = buildDrawSegments(action.points, "straight")
    this.editor.createShapes([
      {
        id: tlId,
        type: "draw",
        x: 0,
        y: 0,
        props: {
          segments,
          color: action.color ?? "black",
          fill: action.fill ?? "none",
          dash: action.dash ?? "solid",
          size: action.size ?? "m",
          isComplete: true,
          isClosed: true,
          isPen: false,
        },
      },
    ])
  }

  drawLine(action: DrawLineAction): void {
    const tlId = this.track(action.id, "line", "line")
    const points = buildLinePointsRecord(action.points)
    this.editor.createShapes([
      {
        id: tlId,
        type: "line",
        x: 0,
        y: 0,
        props: {
          points,
          color: action.color ?? "black",
          dash: action.dash ?? "solid",
          size: action.size ?? "m",
        },
      },
    ])
  }

  drawArrow(action: DrawArrowAction): void {
    const tlId = this.track(action.id, "arrow", "arrow", action.label)
    this.editor.createShapes([
      {
        id: tlId,
        type: "arrow",
        x: 0,
        y: 0,
        props: {
          start: { x: action.start.x, y: action.start.y },
          end: { x: action.end.x, y: action.end.y },
          color: action.color ?? "black",
          dash: action.dash ?? "solid",
          size: action.size ?? "m",
          arrowheadStart: action.arrowheadStart ?? "none",
          arrowheadEnd: action.arrowheadEnd ?? "arrow",
          bend: action.bend ?? 0,
          richText: toRichText(""),
        },
      },
    ])
    if (action.label) this.labels.set(tlId, action.label, action.color)
  }

  writeText(action: WriteTextAction): void {
    const tlId = this.track(action.id, "text", "text", action.text)
    const width = action.w === undefined ? 300 : this.readableTextWidth(action.text, action.size ?? "m", action.w)
    this.editor.createShapes([
      {
        id: tlId,
        type: "text",
        x: action.position.x,
        y: action.position.y,
        props: {
          richText: toRichText(action.text),
          color: action.color ?? "black",
          size: action.size ?? "m",
          font: "sans",
          w: width,
          autoSize: action.w === undefined,
        },
      },
    ])
  }

  writeEquation(action: WriteEquationAction): void {
    const expression = sanitizeMathNotation(action.expression)
    const tlId = this.track(action.id, "text", "equation", expression)
    this.editor.createShapes([
      {
        id: tlId,
        type: "text",
        x: action.position.x,
        y: action.position.y,
        props: {
          richText: toRichText(expression),
          color: action.color ?? "black",
          size: action.size ?? "m",
          font: "mono",
          autoSize: true,
        },
      },
    ])
  }

  plotFunction(action: PlotFunctionAction): void {
    const tlId = this.track(action.id, "line", "plot", `plot: ${action.expression}`)
    const position = action.position ?? { x: 0, y: 0 }
    const scale = action.scale ?? { x: 40, y: 40 }
    const samples = sampleFunction(action.expression, action.domain, action.samples ?? 100)
    const curvePoints = mapPointsToCanvas(samples, { position, scale })

    const shapes: Parameters<Editor["createShapes"]>[0] = []
    const auxiliaryIds: TLShapeId[] = []

    if (action.showAxes ?? true) {
      const [minX, maxX] = action.domain
      const minY = Math.min(...samples.map((p) => p.y), 0)
      const maxY = Math.max(...samples.map((p) => p.y), 0)

      const xAxis = mapPointsToCanvas(
        [
          { x: minX, y: 0 },
          { x: maxX, y: 0 },
        ],
        { position, scale }
      )
      const yAxis = mapPointsToCanvas(
        [
          { x: 0, y: minY },
          { x: 0, y: maxY },
        ],
        { position, scale }
      )

      const axisXId = createShapeId(`${action.id}:axis-x`)
      const axisYId = createShapeId(`${action.id}:axis-y`)
      shapes.push(
        this.buildLineShape(axisXId, xAxis, "grey"),
        this.buildLineShape(axisYId, yAxis, "grey")
      )
      auxiliaryIds.push(axisXId, axisYId)

      const TICK_HALF_LENGTH = 5
      const xTicks = computeNiceTicks(minX, maxX)
      for (const [i, tick] of xTicks.entries()) {
        const [canvasTick] = mapPointsToCanvas([{ x: tick, y: 0 }], { position, scale })
        const markId = createShapeId(`${action.id}:tick-x-${i}`)
        shapes.push(
          this.buildLineShape(
            markId,
            [
              { x: canvasTick.x, y: canvasTick.y - TICK_HALF_LENGTH },
              { x: canvasTick.x, y: canvasTick.y + TICK_HALF_LENGTH },
            ],
            "grey"
          )
        )
        auxiliaryIds.push(markId)

        const labelId = createShapeId(`${action.id}:tick-x-label-${i}`)
        const labelWidth = 40
        shapes.push({
          id: labelId,
          type: "text",
          x: canvasTick.x - labelWidth / 2,
          y: canvasTick.y + TICK_HALF_LENGTH + 2,
          props: {
            richText: toRichText(formatTickLabel(tick)),
            color: "grey",
            size: "s",
            textAlign: "middle",
            w: labelWidth,
            autoSize: false,
          },
        })
        auxiliaryIds.push(labelId)
      }

      const yTicks = computeNiceTicks(minY, maxY)
      for (const [i, tick] of yTicks.entries()) {
        if (tick === 0) continue // already labelled once, at the origin, by the x axis.
        const [canvasTick] = mapPointsToCanvas([{ x: 0, y: tick }], { position, scale })
        const markId = createShapeId(`${action.id}:tick-y-${i}`)
        shapes.push(
          this.buildLineShape(
            markId,
            [
              { x: canvasTick.x - TICK_HALF_LENGTH, y: canvasTick.y },
              { x: canvasTick.x + TICK_HALF_LENGTH, y: canvasTick.y },
            ],
            "grey"
          )
        )
        auxiliaryIds.push(markId)

        const labelId = createShapeId(`${action.id}:tick-y-label-${i}`)
        const labelWidth = 36
        shapes.push({
          id: labelId,
          type: "text",
          x: canvasTick.x - TICK_HALF_LENGTH - labelWidth - 4,
          y: canvasTick.y - 8,
          props: {
            richText: toRichText(formatTickLabel(tick)),
            color: "grey",
            size: "s",
            textAlign: "end",
            w: labelWidth,
            autoSize: false,
          },
        })
        auxiliaryIds.push(labelId)
      }
    }

    shapes.push(this.buildLineShape(tlId, curvePoints, action.color ?? "blue", action.size))
    this.editor.createShapes(shapes)
    this.editor.updateShape({ id: tlId, type: "line", meta: {
      ...this.editor.getShape(tlId)?.meta,
      recifePlot: JSON.parse(JSON.stringify(action)),
      recifePlotAuxiliaries: auxiliaryIds,
    } })
    this.plotAuxiliaries.set(action.id, auxiliaryIds)
  }

  updatePlot(action: UpdatePlotAction): void {
    const tracked = this.requireTracked(action.id)
    const shape = this.editor.getShape(tracked.tlId)
    const parsed = plotFunctionActionSchema.safeParse(shape?.meta.recifePlot)
    if (!shape || !parsed.success) throw new Error("This object has no editable plot formula. Ask for a new graph.")
    if (shape.rotation !== 0 || this.editor.getShapeParentTransform(shape).rotation() !== 0) {
      throw new Error("Please unrotate the graph before changing its formula.")
    }
    const origin = this.editor.getShapePageTransform(shape).applyToPoint(parsed.data.position ?? { x: 0, y: 0 })
    const next: PlotFunctionAction = { ...parsed.data, expression: action.expression,
      domain: action.domain ?? parsed.data.domain, scale: action.scale ?? parsed.data.scale,
      showAxes: action.showAxes ?? parsed.data.showAxes, position: { x: origin.x, y: origin.y } }
    // Validate the new mathematical expression before removing any existing shapes.
    sampleFunction(next.expression, next.domain, next.samples ?? 100)
    this.editor.run(() => { this.deleteObject(action.id); this.plotFunction(next) })
  }

  private buildLineShape(
    id: TLShapeId,
    points: { x: number; y: number }[],
    color: DrawingColor,
    size?: "s" | "m" | "l" | "xl"
  ) {
    const pointsRecord = buildLinePointsRecord(points)
    return {
      id,
      type: "line" as const,
      x: 0,
      y: 0,
      props: {
        points: pointsRecord,
        color,
        size: size ?? "s",
        spline: "cubic" as const,
      },
    }
  }

  moveObject(id: string, position: { x: number; y: number }): void {
    const tracked = this.requireTracked(id)
    const bounds = this.editor.getShapePageBounds(tracked.tlId)
    if (!bounds) throw new Error(`Object "${id}" no longer exists`)
    const delta = { x: position.x - bounds.x, y: position.y - bounds.y }
    const ids = [tracked.tlId, ...(this.plotAuxiliaries.get(id) ?? [])]
    const highlight = this.highlights.get(id)
    if (highlight) ids.push(highlight)
    this.editor.run(() => {
      for (const shapeId of ids) {
        const shape = this.editor.getShape(shapeId)
        if (!shape) continue
        const origin = this.editor.getPointInParentSpace(shape, { x: 0, y: 0 })
        const target = this.editor.getPointInParentSpace(shape, delta)
        this.editor.updateShape({
          id: shapeId, type: shape.type,
          x: shape.x + target.x - origin.x,
          y: shape.y + target.y - origin.y,
        })
      }
    })
  }

  updateObject(id: string, patch: UpdateObjectPatch): void {
    const tracked = this.requireTracked(id)
    const props: Record<string, unknown> = {}

    const supported: Record<TrackedKind, readonly string[]> = {
      geo: ["color", "size", "dash", "fill", "text", "w", "h", "opacity"],
      text: ["color", "size", "text", "w", "opacity"],
      arrow: ["color", "size", "dash", "text", "opacity"],
      line: ["color", "size", "dash", "opacity"],
      draw: ["color", "size", "dash", "fill", "opacity"],
    }
    for (const field of Object.keys(patch)) {
      if (!supported[tracked.kind].includes(field)) {
        throw new Error(`Cannot update "${field}" on ${tracked.kind} object "${id}"`)
      }
    }

    if (patch.color !== undefined) props.color = patch.color
    if (patch.size !== undefined) props.size = patch.size
    if (tracked.kind !== "text" && patch.dash !== undefined) props.dash = patch.dash
    if ((tracked.kind === "geo" || tracked.kind === "draw") && patch.fill !== undefined) {
      props.fill = patch.fill
    }
    if ((tracked.kind === "geo" || tracked.kind === "text") && patch.w !== undefined) props.w = patch.w
    if (tracked.kind === "text" && patch.w !== undefined) props.autoSize = false
    if (tracked.kind === "geo" && patch.h !== undefined) props.h = patch.h
    if (patch.text !== undefined) {
      const text = tracked.summaryKind === "equation" ? sanitizeMathNotation(patch.text) : patch.text
      if (tracked.kind === "geo" || tracked.kind === "arrow") {
        props.richText = toRichText("")
        this.labels.set(tracked.tlId, text, patch.color)
      } else props.richText = toRichText(text)
      tracked.label = text
    }
    if (tracked.kind === "text") {
      const shape = this.editor.getShape(tracked.tlId)
      if (shape?.type === "text" && (patch.w !== undefined || patch.text !== undefined || patch.size !== undefined)) {
        const width = patch.w ?? (shape.props.autoSize ? undefined : shape.props.w)
        if (width !== undefined) {
          props.w = this.readableTextWidth(patch.text ?? renderPlaintextFromRichText(this.editor, shape.props.richText),
            patch.size ?? shape.props.size, width, shape.props.font)
        }
      }
    }

    const top: { id: TLShapeId; type: TrackedKind; opacity?: number; props?: typeof props } = {
      id: tracked.tlId,
      type: tracked.kind,
    }
    if (patch.opacity !== undefined) top.opacity = patch.opacity
    if (Object.keys(props).length > 0) top.props = props

    this.editor.updateShape(top)
  }

  deleteObject(id: string): void {
    const tracked = this.requireTracked(id)
    this.editor.deleteShapes([tracked.tlId])
    this.objects.delete(id)
    const highlightId = this.highlights.get(id)
    if (highlightId) {
      this.editor.deleteShapes([highlightId])
      this.highlights.delete(id)
    }
    this.deletePlotAuxiliaries(id)
  }

  /** A plot_function's axis lines, tick marks and tick labels aren't independently tracked ids - clean them up whenever the plot itself is removed. */
  private deletePlotAuxiliaries(id: string): void {
    const auxiliaryIds = this.plotAuxiliaries.get(id)
    if (!auxiliaryIds) return
    this.editor.deleteShapes(auxiliaryIds)
    this.plotAuxiliaries.delete(id)
  }

  highlightObject(id: string, options: HighlightOptions): void {
    const tracked = this.requireTracked(id)
    const existingHighlightId = this.highlights.get(id)

    if (!options.visible) {
      if (existingHighlightId) {
        this.editor.deleteShapes([existingHighlightId])
        this.highlights.delete(id)
      }
      return
    }

    const bounds = this.editor.getShapePageBounds(tracked.tlId)
    if (!bounds) return
    const pad = 6

    if (existingHighlightId) {
      this.editor.updateShape({
        id: existingHighlightId,
        type: "geo",
        x: bounds.x - pad,
        y: bounds.y - pad,
        props: { w: bounds.w + pad * 2, h: bounds.h + pad * 2, color: options.color },
      })
      this.editor.sendToBack([existingHighlightId])
      return
    }

    const highlightId = createShapeId(`${id}:highlight`)
    this.editor.createShapes([
      {
        id: highlightId,
        type: "geo",
        x: bounds.x - pad,
        y: bounds.y - pad,
        props: {
          geo: "rectangle",
          w: bounds.w + pad * 2,
          h: bounds.h + pad * 2,
          color: options.color,
          fill: "solid",
          dash: "none",
        },
        opacity: 0.35,
      },
    ])
    this.editor.sendToBack([highlightId])
    this.highlights.set(id, highlightId)
  }

  clearRegion(region: ClearRegionAction["region"]): string[] {
    const removed: string[] = []
    for (const [id, tracked] of this.objects) {
      const bounds = this.editor.getShapePageBounds(tracked.tlId)
      if (bounds && regionsIntersect(bounds, region)) {
        this.editor.deleteShapes([tracked.tlId])
        const highlightId = this.highlights.get(id)
        if (highlightId) {
          this.editor.deleteShapes([highlightId])
          this.highlights.delete(id)
        }
        removed.push(id)
      }
    }
    for (const id of removed) {
      this.objects.delete(id)
      this.deletePlotAuxiliaries(id)
    }
    return removed
  }

  focusCamera(target: FocusCameraAction["target"]): void {
    if (target.kind === "bounds") {
      this.editor.zoomToBounds(
        {
          x: target.region.x,
          y: target.region.y,
          w: target.region.w,
          h: target.region.h,
        },
        { animation: { duration: 300 } }
      )
      return
    }

    this.editor.centerOnPoint(target.position, { animation: { duration: 300 } })
    if (target.zoom !== undefined) {
      this.editor.setCamera(
        { ...this.editor.getCamera(), z: target.zoom },
        { animation: { duration: 300 } }
      )
    }
  }

  getObjectBounds(id: string): ObjectBounds | undefined {
    this.restoreTracked()
    const tracked = this.objects.get(id)
    if (!tracked) return undefined
    const bounds = this.editor.getShapePageBounds(tracked.tlId)
    if (!bounds) return undefined
    return { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
  }

  /**
   * A compact snapshot of every AI-created object still actually live on
   * the board - this (never the raw tldraw document, and never objects a
   * student drew by hand, which this adapter has no id for in the first
   * place) is what gets sent to the model as "what's already here".
   *
   * Any tracked id whose shape turns out to be gone (a student deleted it
   * directly on the canvas) is silently dropped from both the result and
   * our own bookkeeping here - the same self-healing the engine relies on
   * for `getObjectBounds`, applied across the whole tracked set at once.
   */
  summarizeObjects(): TrackedObjectSummary[] {
    this.restoreTracked()
    const summaries: TrackedObjectSummary[] = []
    const staleIds: string[] = []

    for (const [id, tracked] of this.objects) {
      const bounds = this.editor.getShapePageBounds(tracked.tlId)
      if (!bounds) {
        staleIds.push(id)
        continue
      }
      summaries.push({
        id,
        kind: tracked.summaryKind,
        ...this.liveLabel(tracked),
        x: bounds.x,
        y: bounds.y,
        w: Math.max(1, bounds.w),
        h: Math.max(1, bounds.h),
      })
    }

    for (const id of staleIds) {
      this.objects.delete(id)
      const highlightId = this.highlights.get(id)
      if (highlightId) {
        this.editor.deleteShapes([highlightId])
        this.highlights.delete(id)
      }
    }

    const candidates = summaries.map((summary) => ({ id: summary.id, bounds: summary }))
    for (const summary of summaries) {
      if (summary.kind !== "arrow") continue
      const tracked = this.objects.get(summary.id)
      if (!tracked) continue
      const shape = this.editor.getShape(tracked.tlId)
      if (!shape || shape.type !== "arrow") continue

      const arrow = shape as TLArrowShape
      const startPoint = { x: arrow.x + arrow.props.start.x, y: arrow.y + arrow.props.start.y }
      const endPoint = { x: arrow.x + arrow.props.end.x, y: arrow.y + arrow.props.end.y }

      const connects: string[] = []
      const startId = findContainingId(startPoint, candidates, summary.id)
      if (startId) connects.push(startId)
      const endId = findContainingId(endPoint, candidates, summary.id)
      if (endId && endId !== startId) connects.push(endId)
      if (connects.length > 0) summary.connects = connects
    }

    return summaries.slice(0, MAX_TRACKED_OBJECT_SUMMARIES)
  }

  private requireTracked(id: string): TrackedObject {
    const tracked = this.objects.get(id)
    if (!tracked) {
      throw new Error(`Unknown id "${id}": the tldraw adapter has no object with this id`)
    }
    return tracked
  }

  private liveLabel(tracked: TrackedObject): { label?: string } {
    const shape = this.labels.get(tracked.tlId) ?? this.editor.getShape(tracked.tlId)
    const label = shape && "richText" in shape.props
      ? renderPlaintextFromRichText(this.editor, shape.props.richText)
      : tracked.label
    return label ? { label: label.slice(0, 200) } : {}
  }

  private readableTextWidth(text: string, size: "s" | "m" | "l" | "xl", requested: number, font = "sans"): number {
    const theme = this.editor.getCurrentTheme()
    // tldraw 5 uses these text-size multipliers on the theme's base font size.
    const fontSize = theme.fontSize * ({ s: 1.125, m: 1.5, l: 2.25, xl: 2.75 }[size])
    // Preserve short labels on one line; prose can wrap, but never inside a word.
    const parts = text.length <= 40 ? text.split(/\r?\n/) : text.split(/\s+/)
    const minimum = Math.max(...parts.map((part) => this.editor.textMeasure.measureText(part, {
      fontFamily: getFontFamily(theme, font), fontSize, lineHeight: theme.lineHeight,
      fontStyle: "normal", fontWeight: "normal", padding: "0px", maxWidth: null,
    }).w))
    return Math.max(requested, Math.ceil(minimum) + 4)
  }
}
