import { describe, expect, it } from "vitest"
import { buildDrawSegments } from "./tldraw-shape-builders"

describe("buildDrawSegments", () => {
  it("gives a straight-sided outline one segment per edge (tldraw draws only two points per straight segment)", () => {
    const triangle = [{ x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 69 }]
    const segments = buildDrawSegments(triangle, "straight")
    expect(segments).toHaveLength(2)
    expect(segments.every((segment) => segment.type === "straight")).toBe(true)
  })

  it("adds the closing edge back to the start for a closed polygon", () => {
    const triangle = [{ x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 69 }]
    expect(buildDrawSegments(triangle, "straight", true)).toHaveLength(3)
  })

  it("keeps a freehand stroke as a single segment through every point", () => {
    const stroke = [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }, { x: 30, y: 5 }]
    expect(buildDrawSegments(stroke, "free")).toHaveLength(1)
  })
})
