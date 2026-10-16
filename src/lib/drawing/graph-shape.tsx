"use client"

/**
 * A live Desmos graph on the whiteboard. The tutor gives equations (and an
 * optional view); Desmos plots them exactly. Double-click to explore it:
 * pan, zoom and edit the equations - edits are saved with the board and the
 * tutor sees them in follow-ups. Without Desmos (no key, or offline) the
 * equations are shown typeset instead, so the lesson still reads.
 *
 * Desmos only ever receives maths (LaTeX expressions and a view); its
 * "actions" feature, which can change values on click, is switched off.
 */

import { useEffect, useRef, useState } from "react"
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  getColorValue,
  resizeBox,
  useColorMode,
  useValue,
  type Editor,
  type RecordProps,
  type TLResizeInfo,
  type TLShape,
} from "tldraw"
import { loadDesmos, type DesmosCalculator } from "./desmos"
import { renderLatex } from "./math-render"

export const GRAPH_SHAPE_TYPE = "recife-graph"

export interface GraphLine {
  latex: string
  /** A tldraw colour name, or a hex colour picked inside Desmos. */
  color: string
  label: string
}

export interface GraphView { left: number; right: number; bottom: number; top: number }

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    [GRAPH_SHAPE_TYPE]: { w: number; h: number; expressions: GraphLine[]; bounds: GraphView | null }
  }
}

export type GraphShape = Extract<TLShape, { type: typeof GRAPH_SHAPE_TYPE }>

/** Curves without a colour get these in turn, so overlaid graphs are told apart. */
export const GRAPH_PALETTE = ["blue", "red", "green", "violet", "orange", "black"] as const

const lineValidator = T.object({ latex: T.string, color: T.string, label: T.string })
const viewValidator = T.object({ left: T.number, right: T.number, bottom: T.number, top: T.number })

export class GraphShapeUtil extends ShapeUtil<GraphShape> {
  static override type = GRAPH_SHAPE_TYPE
  static override props: RecordProps<GraphShape> = {
    w: T.number,
    h: T.number,
    expressions: T.arrayOf(lineValidator),
    bounds: viewValidator.nullable(),
  }

  getDefaultProps(): GraphShape["props"] {
    return { w: 520, h: 380, expressions: [], bounds: null }
  }

  // Double-click to explore the graph; while exploring, scrolling zooms the graph rather than the board.
  override canEdit() { return true }
  override canScroll() { return true }
  override canResize() { return true }

  override onResize(shape: GraphShape, info: TLResizeInfo<GraphShape>) {
    return resizeBox(shape, info)
  }

  getGeometry(shape: GraphShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
  }

  component(shape: GraphShape) {
    return <GraphContent shape={shape} editor={this.editor} />
  }

  getIndicatorPath(shape: GraphShape) {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8)
    return { path }
  }
}

function GraphContent({ shape, editor }: { shape: GraphShape; editor: Editor }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const calculatorRef = useRef<DesmosCalculator | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading")
  const colorMode = useColorMode()
  const editing = useValue("editing graph", () => editor.getEditingShapeId() === shape.id, [editor, shape.id])
  const { expressions, bounds, w, h } = shape.props

  // Create the calculator once; tear it down with the shape.
  useEffect(() => {
    let cancelled = false
    void loadDesmos().then((Desmos) => {
      if (cancelled) return
      if (!Desmos || !hostRef.current) return setStatus("unavailable")
      calculatorRef.current = Desmos.GraphingCalculator(hostRef.current, {
        expressions: false, keypad: false, settingsMenu: false, zoomButtons: false,
        border: false, lockViewport: true, actions: false, expressionsCollapsed: true,
      })
      setStatus("ready")
    })
    return () => {
      cancelled = true
      calculatorRef.current?.destroy()
      calculatorRef.current = null
    }
  }, [])

  // Draw what the board says: the tutor's (or a student's saved) equations and view.
  useEffect(() => {
    const calculator = calculatorRef.current
    if (status !== "ready" || !calculator) return
    const colors = editor.getCurrentTheme().colors[colorMode]
    const wanted = new Set(expressions.map((_, i) => `e${i}`))
    for (const old of calculator.getExpressions()) {
      if (old.id && !wanted.has(old.id)) calculator.removeExpression({ id: old.id })
    }
    expressions.forEach((line, i) => {
      calculator.setExpression({
        id: `e${i}`,
        latex: line.latex,
        color: line.color.startsWith("#") ? line.color : getColorValue(colors, line.color, "solid"),
        ...(line.label ? { label: line.label, showLabel: true } : {}),
      })
    })
    if (bounds) calculator.setMathBounds(bounds)
  }, [status, expressions, bounds, colorMode, editor])

  // Exploring (double-click) unlocks panning/zooming and shows the equation list; otherwise it's a still figure.
  useEffect(() => {
    const calculator = calculatorRef.current
    if (status !== "ready" || !calculator) return
    calculator.updateSettings({ lockViewport: !editing, expressions: editing, zoomButtons: editing })
    if (!editing) return
    // Save the student's own edits with the board (only theirs - our own setExpression calls aren't user-initiated).
    calculator.observeEvent("change", (_name, event) => {
      if (!event.isUserInitiated) return
      const lines = calculator.getExpressions()
        .filter((e) => (e.type ?? "expression") === "expression" && e.latex)
        .slice(0, 12)
        .map((e) => ({ latex: e.latex!.slice(0, 300), color: e.color ?? "black", label: (e.label ?? "").slice(0, 60) }))
      editor.run(() => editor.updateShape<GraphShape>({ id: shape.id, type: GRAPH_SHAPE_TYPE, props: { expressions: lines } }), { history: "ignore" })
    })
    return () => calculator.unobserveEvent("change")
  }, [editing, status, editor, shape.id])

  return (
    <HTMLContainer
      style={{ width: w, height: h, pointerEvents: editing ? "all" : "none", borderRadius: 8, overflow: "hidden",
        background: "white", boxShadow: "0 0 0 1px rgba(15, 23, 42, 0.12)" }}
      // While exploring, the pointer belongs to Desmos, not to tldraw's selection and drawing tools.
      onPointerDown={editing ? (event) => event.stopPropagation() : undefined}
    >
      <div ref={hostRef} style={{ width: "100%", height: "100%", display: status === "unavailable" ? "none" : "block" }} />
      {status === "unavailable" && (
        <div style={{ padding: 16, fontSize: 18, lineHeight: 1.6, color: "#0f172a" }}>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>Graph (Desmos couldn&apos;t load)</div>
          {expressions.map((line, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: renderLatex(line.latex) }} />
          ))}
        </div>
      )}
      {status === "ready" && !editing && (
        <div style={{ position: "absolute", right: 8, bottom: 6, fontSize: 11, color: "#64748b", background: "rgba(255,255,255,0.85)", padding: "1px 6px", borderRadius: 6 }}>
          Double-click to explore
        </div>
      )}
    </HTMLContainer>
  )
}
