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

describe("DrawingEngine authoring scope", () => {
  it("runs every action inside the adapter's authored() scope, so AI-made shapes can be told apart from student work", () => {
    const adapter = new FakeDrawingAdapter()
    let depth = 0
    const depthAtCreate: number[] = []
    adapter.authored = <T,>(fn: () => T): T => {
      depth++
      try { return fn() } finally { depth-- }
    }
    const original = adapter.createShape.bind(adapter)
    adapter.createShape = (action) => { depthAtCreate.push(depth); original(action) }

    new DrawingEngine(adapter).run([createShapeAction("a"), createShapeAction("b")])

    expect(depthAtCreate).toEqual([1, 1])
    expect(depth).toBe(0)
  })

  it("still works with an adapter that has no authored() scope", () => {
    const result = new DrawingEngine(new FakeDrawingAdapter()).run([createShapeAction("a")])
    expect(result.ok).toBe(true)
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

describe("draw_force", () => {
  it("becomes an arrow leaving its object's outline at the given maths angle", () => {
    const adapter = new FakeDrawingAdapter()
    const result = new DrawingEngine(adapter).run([
      { type: "create_shape", id: "block", shape: "rectangle", x: 0, y: 0, w: 80, h: 40 },
      { type: "draw_force", id: "weight", on: "block", angle: 270, length: 60, label: "$mg$" },
    ])
    expect(result.ok).toBe(true)
    const arrow = result.executed[1].action
    expect(arrow).toMatchObject({ type: "draw_arrow", id: "weight", label: "$mg$" })
    if (arrow.type !== "draw_arrow") throw new Error("expected an arrow")
    expect(arrow.start.x).toBeCloseTo(40)
    expect(arrow.start.y).toBeCloseTo(40) // the block's bottom edge
    expect(arrow.end.y).toBeCloseTo(100)
  })

  it("explains that the object must be drawn first", () => {
    const result = new DrawingEngine(new FakeDrawingAdapter()).run([
      { type: "draw_force", id: "f", on: "missing", angle: 0 },
    ])
    expect(result.ok).toBe(false)
    expect(result.error?.message).toMatch(/draw the object first/)
  })
})

describe("forces by named direction on a slope", () => {
  it("braking on a car going downhill (slope 6°, downhill to the right) points up the slope: left and up", () => {
    const adapter = new FakeDrawingAdapter()
    const result = new DrawingEngine(adapter).run([
      { type: "draw_incline", id: "road", position: { x: 0, y: 0 }, angle: 6, downhill: "right" },
      { type: "draw_on_incline", id: "car", incline: "road", at: 0.5 },
      { type: "draw_force", id: "brake", on: "car", direction: "up_slope", label: "$F_{\text{brake}}$" },
      { type: "draw_force", id: "comp", on: "car", direction: "down_slope", label: "$mg\sin 6^\circ$" },
      { type: "draw_force", id: "weight", on: "car", direction: "down", label: "$mg$" },
    ])
    expect(result.ok).toBe(true)
    const arrow = (i: number) => {
      const a = result.executed[i].action
      if (a.type !== "draw_arrow") throw new Error("expected an arrow")
      return { dx: a.end.x - a.start.x, dy: a.end.y - a.start.y } // page: +dy is down
    }
    expect(arrow(2).dx).toBeLessThan(0) // braking: left...
    expect(arrow(2).dy).toBeLessThan(0) // ...and up
    expect(arrow(3).dx).toBeGreaterThan(0) // weight component: right...
    expect(arrow(3).dy).toBeGreaterThan(0) // ...and down
    expect(arrow(4).dx).toBeCloseTo(0) // weight: straight down
    expect(arrow(4).dy).toBeGreaterThan(0)
  })

  it("explains that slope directions need the object on a slope", () => {
    const result = new DrawingEngine(new FakeDrawingAdapter()).run([
      { type: "create_shape", id: "box", shape: "rectangle", x: 0, y: 0, w: 80, h: 40 },
      { type: "draw_force", id: "f", on: "box", direction: "up_slope" },
    ])
    expect(result.ok).toBe(false)
    expect(result.error?.message).toMatch(/draw_on_incline/)
  })
})

describe("copy_figure", () => {
  it("lets forces attach to a copied figure's named parts, with slope directions for a part on a slope", () => {
    const adapter = new FakeDrawingAdapter()
    const result = new DrawingEngine(adapter).run([
      { type: "copy_figure", id: "fig", box: [300, 50, 900, 450], position: { x: 900, y: 0 },
        parts: [{ id: "blockA", box: [500, 100, 560, 200], slope: { angle: 30, downhill: "left" } }, { id: "massB", box: [600, 380, 700, 440] }] },
      { type: "draw_force", id: "fA", on: "blockA", direction: "up_slope" },
      { type: "draw_force", id: "tB", on: "massB", direction: "up" },
    ])
    expect(result.ok).toBe(true)
    const up = result.executed[1].action
    if (up.type !== "draw_arrow") throw new Error("expected an arrow")
    expect(up.end.x - up.start.x).toBeGreaterThan(0) // up a slope going downhill to the left: rightwards...
    expect(up.end.y - up.start.y).toBeLessThan(0) // ...and up
  })
})

describe("connected mechanisms", () => {
  it("runs a pulley, two hanging masses and the string between them", () => {
    const adapter = new FakeDrawingAdapter()
    const result = new DrawingEngine(adapter).run([
      { type: "draw_pulley", id: "P", centre: { x: 300, y: 100 } },
      { type: "draw_mass", id: "A", hang: { pulley: "P", side: "left" }, label: "3 kg" },
      { type: "draw_mass", id: "B", hang: { pulley: "P", side: "right" }, label: "2 kg" },
      { type: "draw_string", id: "s", from: "A", to: "B", over: "P" },
    ])
    expect(result.ok).toBe(true)
    expect(adapter.calls.map((c) => c.method)).toEqual(["drawPulley", "drawMass", "drawMass", "drawString"])
  })
})
