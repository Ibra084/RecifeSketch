import { describe, expect, it } from "vitest"
import {
  COORDINATE_LIMIT,
  DIMENSION_LIMIT,
  drawingActionSchema,
  drawingProgramSchema,
} from "./protocol"

describe("drawingActionSchema", () => {
  it("accepts a valid create_shape action", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_shape",
      id: "box-1",
      shape: "rectangle",
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      color: "blue",
    })
    expect(result.success).toBe(true)
  })

  it("rejects an unknown action type", () => {
    const result = drawingActionSchema.safeParse({
      type: "nuke_board",
      id: "x",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an action missing a required field", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_shape",
      id: "box-1",
      shape: "rectangle",
      x: 0,
      y: 0,
      // w is missing
      h: 50,
    })
    expect(result.success).toBe(false)
  })

  it("rejects unknown extra fields (strict object)", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_shape",
      id: "box-1",
      shape: "rectangle",
      x: 0,
      y: 0,
      w: 100,
      h: 50,
      evilField: "<script>alert(1)</script>",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an invalid id that contains unsafe characters", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_shape",
      id: "box 1 / <evil>",
      shape: "rectangle",
      x: 0,
      y: 0,
      w: 100,
      h: 50,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a coordinate above the coordinate limit", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_shape",
      id: "box-1",
      shape: "rectangle",
      x: COORDINATE_LIMIT + 1,
      y: 0,
      w: 100,
      h: 50,
    })
    expect(result.success).toBe(false)
  })

  it("accepts a coordinate exactly at the coordinate limit", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_shape",
      id: "box-1",
      shape: "rectangle",
      x: COORDINATE_LIMIT,
      y: -COORDINATE_LIMIT,
      w: 100,
      h: 50,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a dimension above the dimension limit", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_shape",
      id: "box-1",
      shape: "rectangle",
      x: 0,
      y: 0,
      w: DIMENSION_LIMIT + 1,
      h: 50,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a non-finite coordinate", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_shape",
      id: "box-1",
      shape: "rectangle",
      x: Number.POSITIVE_INFINITY,
      y: 0,
      w: 100,
      h: 50,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a zero or negative dimension", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_shape",
      id: "box-1",
      shape: "rectangle",
      x: 0,
      y: 0,
      w: 0,
      h: 50,
    })
    expect(result.success).toBe(false)
  })

  it("rejects a polygon with fewer than 3 points", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_polygon",
      id: "poly-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("accepts a polygon with exactly 3 points", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_polygon",
      id: "poly-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects a freehand path with fewer than 2 points", () => {
    const result = drawingActionSchema.safeParse({
      type: "create_freehand_path",
      id: "path-1",
      points: [{ x: 0, y: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects plot_function with an inverted domain", () => {
    const result = drawingActionSchema.safeParse({
      type: "plot_function",
      id: "plot-1",
      expression: "sin(x)",
      domain: [10, -10],
    })
    expect(result.success).toBe(false)
  })

  it("accepts a valid plot_function action", () => {
    const result = drawingActionSchema.safeParse({
      type: "plot_function",
      id: "plot-1",
      expression: "sin(x)",
      domain: [-10, 10],
    })
    expect(result.success).toBe(true)
  })

  it("rejects update_object with an empty patch", () => {
    const result = drawingActionSchema.safeParse({
      type: "update_object",
      id: "box-1",
      patch: {},
    })
    expect(result.success).toBe(false)
  })

  it("accepts update_object with at least one patch field", () => {
    const result = drawingActionSchema.safeParse({
      type: "update_object",
      id: "box-1",
      patch: { color: "red" },
    })
    expect(result.success).toBe(true)
  })

  it("accepts a minimal delete_object action", () => {
    const result = drawingActionSchema.safeParse({
      type: "delete_object",
      id: "box-1",
    })
    expect(result.success).toBe(true)
  })

  it("accepts focus_camera on bounds", () => {
    const result = drawingActionSchema.safeParse({
      type: "focus_camera",
      target: { kind: "bounds", region: { x: 0, y: 0, w: 100, h: 100 } },
    })
    expect(result.success).toBe(true)
  })

  it("rejects focus_camera with an unknown target kind", () => {
    const result = drawingActionSchema.safeParse({
      type: "focus_camera",
      target: { kind: "orbit", position: { x: 0, y: 0 } },
    })
    expect(result.success).toBe(false)
  })
})

describe("drawingProgramSchema", () => {
  it("accepts an empty program", () => {
    const result = drawingProgramSchema.safeParse([])
    expect(result.success).toBe(true)
  })

  it("accepts a program with multiple valid actions", () => {
    const result = drawingProgramSchema.safeParse([
      { type: "create_shape", id: "a", shape: "rectangle", x: 0, y: 0, w: 10, h: 10 },
      { type: "move_object", id: "a", position: { x: 5, y: 5 } },
      { type: "delete_object", id: "a" },
    ])
    expect(result.success).toBe(true)
  })

  it("rejects a program if any single action is invalid", () => {
    const result = drawingProgramSchema.safeParse([
      { type: "create_shape", id: "a", shape: "rectangle", x: 0, y: 0, w: 10, h: 10 },
      { type: "move_object", id: "a", position: { x: "oops", y: 5 } },
    ])
    expect(result.success).toBe(false)
  })
})
