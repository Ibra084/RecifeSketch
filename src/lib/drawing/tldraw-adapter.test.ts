import { describe, expect, it, vi } from "vitest"
import type { Editor } from "tldraw"

vi.mock("tldraw", () => ({
  createShapeId: (id: string) => `shape:${id}`,
  toRichText: (text: string) => ({ text }),
  renderPlaintextFromRichText: (_editor: unknown, richText: { text: string }) => richText.text,
  getFontFamily: () => "sans-serif",
  getIndices: (count: number) => Array.from({ length: count }, (_, i) => `a${i}`),
  compressLegacySegments: (segments: unknown) => segments,
}))
vi.mock("./math-shape", () => ({
  MATH_SHAPE_TYPE: "recife-math",
  measureMath: (_editor: unknown, text: string) => ({ w: text.length * 10, h: 30 }),
}))
vi.mock("./graph-shape", () => ({
  GRAPH_SHAPE_TYPE: "recife-graph",
  GRAPH_PALETTE: ["blue", "red", "green", "violet", "orange", "black"],
}))
import { TldrawDrawingAdapter } from "./tldraw-adapter"

function fixture() {
  type Shape = { id: string; type: string; x: number; y: number; rotation?: number; meta: Record<string, unknown>; props: Record<string, unknown> }
  const shapes = new Map<string, Shape>()
  const editor = {
    sideEffects: {
      registerAfterChangeHandler: () => () => {}, registerAfterCreateHandler: () => () => {}, registerAfterDeleteHandler: () => () => {},
      registerBeforeCreateHandler: () => () => {},
    },
    getCurrentPageShapes: () => Array.from(shapes.values()),
    createShapes: (items: Shape[]) => items.forEach((shape) => shapes.set(shape.id, structuredClone({ ...shape, meta: shape.meta ?? {} }))),
    updateShape: (patch: Partial<Shape> & { id: string }) => {
      const shape = shapes.get(patch.id)!
      shapes.set(patch.id, { ...shape, ...patch, props: { ...shape.props, ...patch.props } })
    },
    getShape: (id: string) => shapes.get(id),
    getShapePageBounds: (id: string | Shape) => {
      const s = shapes.get(typeof id === "string" ? id : id.id)
      if (!s) return undefined
      const points = Object.values(s.props.points ?? {}) as { x: number; y: number }[]
      return { x: s.x + (points.length ? Math.min(...points.map(p => p.x)) : 0),
        y: s.y + (points.length ? Math.min(...points.map(p => p.y)) : 0), w: Number(s.props.w ?? 100), h: Number(s.props.h ?? 0) }
    },
    getPointInParentSpace: (_shape: unknown, point: { x: number; y: number }) => point,
    run: (fn: () => void) => fn(),
    getCurrentTheme: () => ({ fontSize: 16, lineHeight: 1.35 }),
    textMeasure: { measureText: (text: string) => ({ w: text.length * 12 }) },
  }
  return { adapter: new TldrawDrawingAdapter(editor as unknown as Editor), editor, shapes }
}

describe("tldraw adapter regression contracts (editor stub)", () => {
  it("updates geo and arrow labels without silently succeeding", () => {
    const { adapter, shapes } = fixture()
    adapter.createShape({ type: "create_shape", id: "r", shape: "rectangle", x: 0, y: 0, w: 150, h: 60, label: "Resistor" })
    adapter.updateObject("r", { text: "20 Ω" })
    expect(shapes.get("shape:r")!.props.richText).toEqual({ text: "" })
    expect(shapes.get("shape:shape:r:label")!.props).toMatchObject({ text: "20 Ω", mode: "mixed" })
    adapter.drawArrow({ type: "draw_arrow", id: "i", start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, label: "I" })
    adapter.updateObject("i", { text: "0.5 A" })
    expect(shapes.get("shape:shape:i:label")!.props).toMatchObject({ text: "0.5 A", mode: "mixed" })
  })
  it("writes text with a wrap width that can be widened later", () => {
    const { adapter, shapes } = fixture()
    adapter.writeText({ type: "write_text", id: "t", position: { x: 0, y: 0 }, text: "Battery", w: 30 })
    expect(shapes.get("shape:t")).toMatchObject({ type: "recife-math", props: { text: "Battery", mode: "mixed", maxW: 30 } })
    adapter.updateObject("t", { w: 250 })
    expect(shapes.get("shape:t")!.props.maxW).toBe(250)
  })
  it("moves a wire's visible top-left, not its zero origin", () => {
    const { adapter, editor } = fixture()
    adapter.drawLine({ type: "draw_line", id: "wire", points: [{ x: 100, y: 100 }, { x: 200, y: 100 }] })
    adapter.moveObject("wire", { x: 300, y: 300 })
    expect(editor.getShapePageBounds("shape:wire")).toMatchObject({ x: 300, y: 300 })
  })
  it("rejects unsupported patches before applying any part", () => {
    const { adapter, shapes } = fixture()
    adapter.drawLine({ type: "draw_line", id: "wire", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] })
    expect(() => adapter.updateObject("wire", { color: "red", text: "oops" })).toThrow(/Cannot update/)
    expect(shapes.get("shape:wire")!.props.color).toBe("black")
  })
  it("turns a box about its centre, anticlockwise for a positive angle (a block on a slope)", () => {
    const { adapter, shapes } = fixture()
    adapter.createShape({ type: "create_shape", id: "block", shape: "rectangle", x: 100, y: 100, w: 80, h: 40, rotation: 30 })
    const block = shapes.get("shape:block")!
    // tldraw turns clockwise for positive radians on screen, so an anticlockwise 30° is -π/6.
    expect(block.rotation!).toBeCloseTo(-Math.PI / 6)
    // The box's own centre (40, 20 in its frame), turned and placed, is still where an unturned box's centre would be.
    const r = block.rotation!
    const centre = { x: block.x + 40 * Math.cos(r) - 20 * Math.sin(r), y: block.y + 40 * Math.sin(r) + 20 * Math.cos(r) }
    expect(centre.x).toBeCloseTo(140)
    expect(centre.y).toBeCloseTo(120)
  })
  it("leaves an unturned box exactly where it was asked to go", () => {
    const { adapter, shapes } = fixture()
    adapter.createShape({ type: "create_shape", id: "box", shape: "rectangle", x: 10, y: 20, w: 30, h: 40 })
    expect(shapes.get("shape:box")).toMatchObject({ x: 10, y: 20, rotation: 0 })
  })
  it("places a Desmos graph from its equations, giving uncoloured curves distinct colours", () => {
    const { adapter, shapes } = fixture()
    adapter.drawGraph({ type: "draw_graph", id: "g", position: { x: 10, y: 20 },
      expressions: [{ latex: "y=x^2-4" }, { latex: "(2,0)", label: "Root", color: "red" }, { latex: "y=2x" }] })
    expect(shapes.get("shape:g")).toMatchObject({ type: "recife-graph", x: 10, y: 20, props: {
      w: 520, h: 380, bounds: null,
      expressions: [{ latex: "y=x^2-4", color: "blue", label: "" }, { latex: "(2,0)", color: "red", label: "Root" }, { latex: "y=2x", color: "green", label: "" }],
    } })
    expect(adapter.summarizeObjects()[0]).toMatchObject({ id: "g", kind: "graph", label: "graph: y=x^2-4; (2,0); y=2x" })
  })
  it("draws a second graph beside the first instead of on top of it", () => {
    const { adapter, shapes } = fixture()
    adapter.drawGraph({ type: "draw_graph", id: "g1", position: { x: 0, y: 0 }, expressions: [{ latex: "y=x^2" }] })
    adapter.drawGraph({ type: "draw_graph", id: "g2", position: { x: 0, y: 0 }, expressions: [{ latex: "y=\\sin(x)" }] })
    expect(shapes.get("shape:g1")).toMatchObject({ x: 0, y: 0 })
    expect(shapes.get("shape:g2")).toMatchObject({ x: 560, y: 0 }) // 520 wide + 40 margin
  })
  it("moves the notes planned beside a graph along with it, when the graph had to move", () => {
    const { adapter, shapes } = fixture()
    adapter.drawGraph({ type: "draw_graph", id: "g1", position: { x: 0, y: 0 }, expressions: [{ latex: "y=x^2" }] })
    adapter.beginPlan()
    adapter.drawGraph({ type: "draw_graph", id: "g2", position: { x: 0, y: 0 }, expressions: [{ latex: "y=\\sin(x)" }] })
    adapter.writeText({ type: "write_text", id: "note", position: { x: 540, y: 40 }, text: "Period $2\\pi$" })
    expect(shapes.get("shape:g2")).toMatchObject({ x: 560 })
    expect(shapes.get("shape:note")).toMatchObject({ x: 1100, y: 40 }) // still beside g2, 20 units past its planned right edge
  })
  it("doesn't carry a graph's move over into the next lesson", () => {
    const { adapter, shapes } = fixture()
    adapter.drawGraph({ type: "draw_graph", id: "g1", position: { x: 0, y: 0 }, expressions: [{ latex: "y=x" }] })
    adapter.drawGraph({ type: "draw_graph", id: "g2", position: { x: 0, y: 0 }, expressions: [{ latex: "y=x^2" }] })
    adapter.beginPlan()
    adapter.writeText({ type: "write_text", id: "later", position: { x: 100, y: 600 }, text: "Next question" })
    expect(shapes.get("shape:later")).toMatchObject({ x: 100, y: 600 })
  })
  it("changes an existing graph's equations and view in place", () => {
    const { adapter, shapes } = fixture()
    adapter.drawGraph({ type: "draw_graph", id: "g", position: { x: 0, y: 0 }, expressions: [{ latex: "y=x" }] })
    adapter.updateGraph({ type: "update_graph", id: "g", expressions: [{ latex: "y=x^3" }], bounds: { left: -5, right: 5, bottom: -10, top: 10 } })
    expect(shapes.get("shape:g")!.props).toMatchObject({ expressions: [{ latex: "y=x^3" }], bounds: { left: -5, right: 5, bottom: -10, top: 10 } })
  })
  it("fills a box with the writing put inside it, instead of a narrow column spilling out", () => {
    const { adapter, shapes } = fixture()
    adapter.createShape({ type: "create_shape", id: "frame", shape: "rectangle", x: 0, y: 0, w: 550, h: 100 })
    adapter.writeText({ type: "write_text", id: "answer", position: { x: 10, y: 10 }, w: 120,
      text: "Model answer: since the expression simplifies to the constant 4, it is independent of x." })
    expect(shapes.get("shape:answer")!.props.maxW).toBe(550 - 10 - 14) // the box's inner width, not 120
  })
  it("grows the box when its writing is taller than it", () => {
    const { adapter, shapes } = fixture()
    adapter.createShape({ type: "create_shape", id: "frame", shape: "rectangle", x: 0, y: 0, w: 550, h: 20 })
    adapter.writeText({ type: "write_text", id: "answer", position: { x: 10, y: 10 }, text: "Model answer" })
    expect(shapes.get("shape:frame")!.props.h).toBe(10 + 30 + 14) // text top + its height + padding
  })
  it("never wraps a paragraph narrower than a readable width", () => {
    const { adapter, shapes } = fixture()
    adapter.writeText({ type: "write_text", id: "p", position: { x: 0, y: 0 }, w: 120,
      text: "Because the result is 4, a constant, it is independent of x." })
    expect(shapes.get("shape:p")!.props.maxW).toBe(320)
    adapter.writeText({ type: "write_text", id: "label", position: { x: 0, y: 400 }, w: 60, text: "Vertex" })
    expect(shapes.get("shape:label")!.props.maxW).toBe(60) // short labels keep the width they asked for
  })
  it("typesets equations as LaTeX shapes the AI can read back", () => {
    const { adapter, shapes } = fixture()
    adapter.writeEquation({ type: "write_equation", id: "eq", position: { x: 10, y: 20 }, expression: "a = \\frac{F}{m}" })
    expect(shapes.get("shape:eq")).toMatchObject({ type: "recife-math", x: 10, y: 20, props: { text: "a = \\frac{F}{m}", mode: "latex" } })
    expect(adapter.summarizeObjects()[0]).toMatchObject({ id: "eq", kind: "equation", label: "a = \\frac{F}{m}" })
  })
  it("writes all prose - with or without $maths$ - as typeset text on a solid backing", () => {
    const { adapter, shapes } = fixture()
    adapter.writeText({ type: "write_text", id: "m", position: { x: 0, y: 0 }, text: "So $a = 1.2\\,\\text{m/s}^2$" })
    adapter.writeText({ type: "write_text", id: "p", position: { x: 0, y: 500 }, text: "Forces on the crate" })
    expect(shapes.get("shape:m")).toMatchObject({ type: "recife-math", props: { mode: "mixed" } })
    expect(shapes.get("shape:p")).toMatchObject({ type: "recife-math", props: { mode: "mixed" } })
  })
  it("stacks lines of working in one column, in order, whatever positions the model gave", () => {
    const { adapter, shapes } = fixture()
    adapter.beginPlan()
    adapter.writeEquation({ type: "write_equation", id: "a", position: { x: 0, y: 0 }, expression: "W = mg" })
    adapter.writeEquation({ type: "write_equation", id: "b", position: { x: 20, y: 10 }, expression: "F = ma" })
    adapter.writeEquation({ type: "write_equation", id: "c", position: { x: 900, y: -400 }, expression: "a = F/m" })
    expect(shapes.get("shape:b")).toMatchObject({ x: 0, y: 46 }) // a's 30-unit height + a 16-unit gap
    expect(shapes.get("shape:c")).toMatchObject({ x: 0, y: 92 }) // not flung far away
  })
  it("puts a lesson's notes in a column right beside what it drew, top-aligned with it", () => {
    const { adapter, shapes } = fixture()
    adapter.beginPlan()
    adapter.createShape({ type: "create_shape", id: "block", shape: "rectangle", x: 100, y: 200, w: 300, h: 150 })
    adapter.writeText({ type: "write_text", id: "n1", position: { x: 5000, y: 5000 }, text: "The block is in equilibrium so the forces balance." })
    adapter.writeEquation({ type: "write_equation", id: "n2", position: { x: -300, y: 0 }, expression: "R = mg" })
    expect(shapes.get("shape:n1")).toMatchObject({ x: 448, y: 200 }) // 48 to the right of the block, level with its top
    expect(shapes.get("shape:n2")!.x).toBe(448)
    expect(shapes.get("shape:n2")!.y).toBeGreaterThan(200)
  })
  it("puts notes beside a figure drawn below the question, level with the figure - not up by the question", () => {
    const { adapter, shapes } = fixture()
    adapter.beginPlan()
    adapter.setImageRegion({ x: 0, y: 0, w: 600, h: 400 }) // the question photo
    adapter.createShape({ type: "create_shape", id: "fig", shape: "rectangle", x: 700, y: 700, w: 300, h: 300 })
    adapter.writeText({ type: "write_text", id: "n", position: { x: 0, y: 0 }, text: "Each particle has tension T up and its weight down." })
    expect(shapes.get("shape:n")).toMatchObject({ x: 1048, y: 700 })
  })
  it("never runs the notes column across the question photo", () => {
    const { adapter, shapes } = fixture()
    adapter.beginPlan()
    adapter.setImageRegion({ x: 0, y: 0, w: 600, h: 400 })
    adapter.createShape({ type: "create_shape", id: "mark", shape: "rectangle", x: 50, y: 50, w: 100, h: 100 }) // drawn over the question
    adapter.writeText({ type: "write_text", id: "n", position: { x: 0, y: 0 }, text: "The tension is the same throughout a light string." })
    expect(shapes.get("shape:n")!.x).toBe(648) // past the question, not on top of it
  })
  it("keeps a short label placed on the drawing where it was put", () => {
    const { adapter, shapes } = fixture()
    adapter.beginPlan()
    adapter.createShape({ type: "create_shape", id: "slab", shape: "rectangle", x: 0, y: 0, w: 300, h: 150 })
    adapter.writeText({ type: "write_text", id: "theta", position: { x: 320, y: 100 }, text: "θ" })
    expect(shapes.get("shape:theta")).toMatchObject({ x: 320, y: 100 })
  })
  it("edits an equation's LaTeX in place and re-measures it", () => {
    const { adapter, shapes } = fixture()
    adapter.writeEquation({ type: "write_equation", id: "eq", position: { x: 0, y: 0 }, expression: "x" })
    adapter.updateObject("eq", { text: "x^2 + 1", color: "red" })
    expect(shapes.get("shape:eq")!.props).toMatchObject({ text: "x^2 + 1", color: "red", w: 70 })
  })
  it("still summarizes native text from older boards, with safe length and thin bounds", () => {
    const { adapter, editor } = fixture()
    editor.createShapes([{ id: "shape:t", type: "text", x: 0, y: 0, meta: { recifeObjectId: "t", recifeKind: "text" }, props: { richText: { text: "Before" } } }])
    editor.updateShape({ id: "shape:t", props: { richText: { text: "x".repeat(201) } } })
    expect(adapter.summarizeObjects()[0]).toMatchObject({ label: "x".repeat(200), h: 1 })
  })
})
