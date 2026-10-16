import { expect, it } from "vitest"
import { drawingActionSchema } from "./protocol"
import { curveToLine, repeatedCurveToLine } from "./curves"
import { DrawingEngine } from "./engine"
import { FakeDrawingAdapter } from "./fake-adapter"

const curve = { type: "draw_curve" as const, id: "round-loop", start: { x: 0, y: 0 },
  segments: [{ c1: { x: 100, y: 0 }, c2: { x: 100, y: 100 }, end: { x: 0, y: 100 } }] }
it("produces a smooth bowed path, not a straight control-point polygon", () => {
  const line = curveToLine(curve)
  expect(line.points).toHaveLength(17)
  expect(line.points[8]).toEqual({ x: 75, y: 50 })
  expect(line.points.at(-1)).toEqual({ x: 0, y: 100 })
})
it("validates, executes and remains addressable under its original id", () => {
  const adapter = new FakeDrawingAdapter()
  const action = drawingActionSchema.parse(curve)
  expect(new DrawingEngine(adapter).run([action, { type: "move_object", id: curve.id, position: { x: 300, y: 300 } }]).ok).toBe(true)
  expect(adapter.getObjectBounds(curve.id)?.x).toBe(300)
})
it("bounds model geometry complexity", () => {
  expect(drawingActionSchema.safeParse({ ...curve, segments: Array(31).fill(curve.segments[0]) }).success).toBe(false)
})

it("draws each requested turn and keeps exact endpoints", () => {
  const action = { type: "draw_repeated_curve" as const, id: "turns", start: { x: 100, y: 100 }, end: { x: 100, y: 300 }, amplitude: 40, cycles: 6, profile: "loops" as const }
  expect(drawingActionSchema.safeParse(action).success).toBe(true)
  const points = repeatedCurveToLine(action).points
  expect(points).toHaveLength(145)
  expect(points[0]).toEqual(action.start)
  expect(points.at(-1)).toEqual(action.end)
  const positivePeaks = points.filter((point, i) => i > 0 && i < points.length - 1 && point.x > points[i - 1].x && point.x > points[i + 1].x)
  expect(positivePeaks).toHaveLength(6)
  expect(Math.max(...points.map(point => point.x))).toBeCloseTo(140)
  expect(Math.min(...points.map(point => point.x))).toBeCloseTo(60)
})
it("rejects a zero-length repeated curve", () => {
  expect(drawingActionSchema.safeParse({ type: "draw_repeated_curve", id: "bad", start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, amplitude: 20, cycles: 4, profile: "loops" }).success).toBe(false)
})
