import { describe, expect, it } from "vitest"
import { DrawingEngine, runDrawingProgram } from "./engine"
import { FakeDrawingAdapter } from "./fake-adapter"
import type { DrawingAction } from "./protocol"

function createShapeAction(id: string, overrides: Partial<DrawingAction> = {}): DrawingAction {
  return {
    type: "create_shape",
    id,
    shape: "rectangle",
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    ...overrides,
  } as DrawingAction
}

describe("DrawingEngine", () => {
  it("creates a shape via the adapter and reports success", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    const result = engine.run([createShapeAction("a")])

    expect(result.ok).toBe(true)
    expect(adapter.calls).toEqual([{ method: "createShape", action: createShapeAction("a") }])
  })

  it("executes actions in the exact given order", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    engine.run([createShapeAction("a"), createShapeAction("b"), createShapeAction("c")])

    expect(adapter.calls.map((call) => (call as { action: { id: string } }).action.id)).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("rejects a create action that reuses an existing id", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    const result = engine.run([createShapeAction("a"), createShapeAction("a")])

    expect(result.ok).toBe(false)
    expect(result.error?.index).toBe(1)
    expect(result.error?.message).toMatch(/already exists/i)
  })

  it("stops execution at the first error and runs nothing after it", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    const result = engine.run([
      createShapeAction("a"),
      { type: "move_object", id: "missing", position: { x: 1, y: 1 } },
      createShapeAction("b"),
    ])

    expect(result.ok).toBe(false)
    expect(result.error?.index).toBe(1)
    expect(adapter.calls.some((call) => call.method === "createShape" && call.action.id === "b")).toBe(
      false
    )
  })

  it("rejects move_object for an id that was never created", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    const result = engine.run([{ type: "move_object", id: "ghost", position: { x: 1, y: 1 } }])

    expect(result.ok).toBe(false)
    expect(result.error?.message).toMatch(/unknown id/i)
  })

  it("calls adapter.moveObject with the new position for a known id", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    engine.run([createShapeAction("a"), { type: "move_object", id: "a", position: { x: 5, y: 7 } }])

    expect(adapter.calls).toContainEqual({ method: "moveObject", id: "a", position: { x: 5, y: 7 } })
  })

  it("calls adapter.updateObject with the patch for a known id", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    engine.run([createShapeAction("a"), { type: "update_object", id: "a", patch: { color: "red" } }])

    expect(adapter.calls).toContainEqual({
      method: "updateObject",
      id: "a",
      patch: { color: "red" },
    })
  })

  it("removes an id from the registry on delete, so later references fail", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    const result = engine.run([
      createShapeAction("a"),
      { type: "delete_object", id: "a" },
      { type: "move_object", id: "a", position: { x: 1, y: 1 } },
    ])

    expect(result.ok).toBe(false)
    expect(result.error?.index).toBe(2)
    expect(result.error?.message).toMatch(/unknown id/i)
  })

  it("allows recreating an id after it has been deleted", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    const result = engine.run([
      createShapeAction("a"),
      { type: "delete_object", id: "a" },
      createShapeAction("a"),
    ])

    expect(result.ok).toBe(true)
  })

  it("treats an id as unknown once its backing object disappears, even if our own deleteObject was never called", () => {
    // Models a student deleting an AI-created shape directly on the
    // canvas (bypassing delete_object entirely): the engine must ask the
    // adapter for live state rather than trusting its own history, so a
    // later reference to that id fails gracefully instead of touching a
    // ghost object.
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)
    engine.run([createShapeAction("a")])

    adapter.simulateExternalRemoval("a")
    const result = engine.run([{ type: "move_object", id: "a", position: { x: 1, y: 1 } }])

    expect(result.ok).toBe(false)
    expect(result.error?.message).toMatch(/unknown id/i)
  })

  it("allows a create action to reuse an id whose backing object was removed externally", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)
    engine.run([createShapeAction("a")])

    adapter.simulateExternalRemoval("a")
    const result = engine.run([createShapeAction("a")])

    expect(result.ok).toBe(true)
  })

  it("tracks liveness per creating action type, not just create_shape", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    const result = engine.run([
      { type: "draw_arrow", id: "arrow-1", start: { x: 0, y: 0 }, end: { x: 10, y: 10 } },
      { type: "move_object", id: "arrow-1", position: { x: 5, y: 5 } },
    ])

    expect(result.ok).toBe(true)
  })

  it("calls adapter.highlightObject for a known id", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    engine.run([
      createShapeAction("a"),
      { type: "highlight_object", id: "a", color: "yellow", visible: true },
    ])

    expect(adapter.calls).toContainEqual({
      method: "highlightObject",
      id: "a",
      options: { color: "yellow", visible: true },
    })
  })

  it("rejects highlight_object for an unknown id", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    const result = engine.run([{ type: "highlight_object", id: "ghost" }])

    expect(result.ok).toBe(false)
    expect(result.error?.message).toMatch(/unknown id/i)
  })

  it("defaults highlight_object color and visibility when omitted", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)

    engine.run([createShapeAction("a"), { type: "highlight_object", id: "a" }])

    expect(adapter.calls).toContainEqual({
      method: "highlightObject",
      id: "a",
      options: { color: "yellow", visible: true },
    })
  })

  it("forwards clear_region to the adapter and drops returned ids from the registry", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)
    adapter.nextClearRegionResult = ["a"]

    const result = engine.run([
      createShapeAction("a"),
      { type: "clear_region", region: { x: 0, y: 0, w: 100, h: 100 } },
      { type: "move_object", id: "a", position: { x: 1, y: 1 } },
    ])

    expect(result.ok).toBe(false)
    expect(result.error?.index).toBe(2)
    expect(result.error?.message).toMatch(/unknown id/i)
  })

  it("forwards focus_camera to the adapter", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)
    const target = { kind: "point" as const, position: { x: 0, y: 0 }, zoom: 1 }

    engine.run([{ type: "focus_camera", target }])

    expect(adapter.calls).toContainEqual({ method: "focusCamera", target })
  })

  it("forwards plot_function to the adapter", () => {
    const adapter = new FakeDrawingAdapter()
    const engine = new DrawingEngine(adapter)
    const action: DrawingAction = {
      type: "plot_function",
      id: "plot-1",
      expression: "sin(x)",
      domain: [-10, 10],
    }

    const result = engine.run([action])

    expect(result.ok).toBe(true)
    expect(adapter.calls).toContainEqual({ method: "plotFunction", action })
  })
})

describe("runDrawingProgram", () => {
  it("returns a validation-stage failure for malformed input without touching the adapter", () => {
    const adapter = new FakeDrawingAdapter()

    const result = runDrawingProgram(adapter, [{ type: "create_shape", id: "a" }])

    expect(result.ok).toBe(false)
    expect(result.stage).toBe("validation")
    expect(adapter.calls).toHaveLength(0)
  })

  it("validates then executes a well-formed raw program", () => {
    const adapter = new FakeDrawingAdapter()

    const result = runDrawingProgram(adapter, [
      { type: "create_shape", id: "a", shape: "rectangle", x: 0, y: 0, w: 10, h: 10 },
    ])

    expect(result.ok).toBe(true)
    expect(result.stage).toBe("execution")
    expect(adapter.calls).toHaveLength(1)
  })
})
