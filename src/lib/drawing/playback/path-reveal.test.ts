import { describe, expect, it } from "vitest"
import { revealPath } from "./path-reveal"

describe("path reveal", () => {
  it("grows a two-point wire instead of showing it in full", () => {
    expect(revealPath([{ x: 10, y: 20 }, { x: 110, y: 20 }], 0.25))
      .toEqual([{ x: 10, y: 20 }, { x: 35, y: 20 }])
  })
  it("travels by distance around corners", () => {
    expect(revealPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 90 }], 0.5))
      .toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 40 }])
  })
  it("preserves the final path and handles coincident points", () => {
    const points = [{ x: 4, y: 8 }, { x: 4, y: 8 }]
    expect(revealPath(points, 0)).toEqual(points)
    expect(revealPath(points, 1)).toEqual(points)
  })
})
