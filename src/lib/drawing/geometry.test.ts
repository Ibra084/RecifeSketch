import { describe, expect, it } from "vitest"
import { findContainingId } from "./geometry"

const candidates = [
  { id: "box-a", bounds: { x: 0, y: 0, w: 100, h: 100 } },
  { id: "box-b", bounds: { x: 200, y: 200, w: 50, h: 50 } },
]

describe("findContainingId", () => {
  it("finds the candidate whose bounds contain the point", () => {
    expect(findContainingId({ x: 50, y: 50 }, candidates, "none")).toBe("box-a")
  })

  it("returns undefined when no candidate contains the point", () => {
    expect(findContainingId({ x: 1000, y: 1000 }, candidates, "none")).toBeUndefined()
  })

  it("excludes the given id even if it would otherwise match", () => {
    expect(findContainingId({ x: 50, y: 50 }, candidates, "box-a")).toBeUndefined()
  })

  it("applies padding so a point just outside the bounds still counts", () => {
    expect(findContainingId({ x: 103, y: 50 }, candidates, "none", 10)).toBe("box-a")
  })

  it("defaults to a small padding when none is given", () => {
    expect(findContainingId({ x: 100.5, y: 50 }, candidates, "none")).toBe("box-a")
    expect(findContainingId({ x: 150, y: 50 }, candidates, "none")).toBeUndefined()
  })
})
