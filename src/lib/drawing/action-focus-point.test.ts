import { describe, expect, it } from "vitest"
import { actionFocusPoint } from "./action-focus-point"
import type { DrawingAction } from "./protocol"

describe("actionFocusPoint", () => {
  it("returns the center of a created shape", () => {
    const action: DrawingAction = { type: "create_shape", id: "a", shape: "rectangle", x: 0, y: 0, w: 100, h: 50 }
    expect(actionFocusPoint(action)).toEqual({ x: 50, y: 25 })
  })

  it("returns the centroid of a freehand path", () => {
    const action: DrawingAction = {
      type: "create_freehand_path",
      id: "a",
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    }
    expect(actionFocusPoint(action)).toEqual({ x: 50, y: 0 })
  })

  it("returns the midpoint of an arrow", () => {
    const action: DrawingAction = {
      type: "draw_arrow",
      id: "a",
      start: { x: 0, y: 0 },
      end: { x: 100, y: 100 },
    }
    expect(actionFocusPoint(action)).toEqual({ x: 50, y: 50 })
  })

  it("returns the write position for text and equations", () => {
    const text: DrawingAction = { type: "write_text", id: "a", position: { x: 10, y: 20 }, text: "hi" }
    const eq: DrawingAction = { type: "write_equation", id: "a", position: { x: 30, y: 40 }, expression: "x" }
    expect(actionFocusPoint(text)).toEqual({ x: 10, y: 20 })
    expect(actionFocusPoint(eq)).toEqual({ x: 30, y: 40 })
  })

  it("returns the center of a clear_region", () => {
    const action: DrawingAction = { type: "clear_region", region: { x: 0, y: 0, w: 100, h: 50 } }
    expect(actionFocusPoint(action)).toEqual({ x: 50, y: 25 })
  })

  it("returns null for actions with no inherent coordinates (reference-only or camera actions)", () => {
    expect(actionFocusPoint({ type: "move_object", id: "a", position: { x: 1, y: 1 } })).toBeNull()
    expect(actionFocusPoint({ type: "highlight_object", id: "a" })).toBeNull()
    expect(actionFocusPoint({ type: "delete_object", id: "a" })).toBeNull()
    expect(
      actionFocusPoint({ type: "focus_camera", target: { kind: "point", position: { x: 1, y: 1 } } })
    ).toBeNull()
  })
})
