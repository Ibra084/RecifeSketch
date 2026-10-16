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
import { TldrawDrawingAdapter } from "./tldraw-adapter"

function fixture() {
  type Shape = { id: string; type: string; x: number; y: number; meta: Record<string, unknown>; props: Record<string, unknown> }
  const shapes = new Map<string, Shape>()
  const editor = {
    sideEffects: {
      registerAfterChangeHandler: () => () => {}, registerAfterCreateHandler: () => () => {}, registerAfterDeleteHandler: () => () => {},
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
    expect(shapes.get("shape:shape:r:label")!.props.richText).toEqual({ text: "20 Ω" })
    adapter.drawArrow({ type: "draw_arrow", id: "i", start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, label: "I" })
    adapter.updateObject("i", { text: "0.5 A" })
    expect(shapes.get("shape:shape:i:label")!.props.richText).toEqual({ text: "0.5 A" })
  })
  it("keeps a short label readable and allows widening it", () => {
    const { adapter, shapes } = fixture()
    adapter.writeText({ type: "write_text", id: "t", position: { x: 0, y: 0 }, text: "Battery", w: 30 })
    expect(shapes.get("shape:t")!.props.w).toBe(88)
    adapter.updateObject("t", { w: 250 })
    expect(shapes.get("shape:t")!.props.w).toBe(250)
    expect(shapes.get("shape:t")!.props.autoSize).toBe(false)
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
  it("summarizes manually edited live text with safe length and thin bounds", () => {
    const { adapter, editor } = fixture()
    adapter.writeText({ type: "write_text", id: "t", position: { x: 0, y: 0 }, text: "Before" })
    editor.updateShape({ id: "shape:t", props: { richText: { text: "x".repeat(201) } } })
    expect(adapter.summarizeObjects()[0]).toMatchObject({ label: "x".repeat(200), h: 1 })
  })
})
