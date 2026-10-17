import { describe, expect, it } from "vitest"
import { hangingMassCentre, pulleyAtCorner, stringPath, tangentPoint } from "./mechanics"

const wheel = { cx: 0, cy: 0, r: 30 }
const dist = (p: { x: number; y: number }) => Math.hypot(p.x - wheel.cx, p.y - wheel.cy)

describe("two masses over a fixed pulley (the question's 3 kg and 2 kg)", () => {
  const left = hangingMassCentre(wheel, "left", 150, 40)
  const right = hangingMassCentre(wheel, "right", 150, 40)
  const leftTop = { x: left.x, y: left.y - 20 }
  const rightTop = { x: right.x, y: right.y - 20 }
  const path = stringPath(leftTop, rightTop, wheel)

  it("hangs each mass under its own side of the wheel, apart from each other", () => {
    expect(left.x).toBe(-30)
    expect(right.x).toBe(30)
  })
  it("runs both strings exactly vertically up to the wheel", () => {
    expect(path[1].x).toBeCloseTo(-30) // leaves the wheel straight above the left mass
    expect(path.at(-2)!.x).toBeCloseTo(30)
  })
  it("wraps over the top of the wheel, touching it all the way round", () => {
    const arc = path.slice(1, -1)
    for (const p of arc) expect(dist(p)).toBeCloseTo(30)
    expect(Math.min(...arc.map((p) => p.y))).toBeCloseTo(-30) // reaches the very top
    expect(Math.max(...arc.map((p) => p.y))).toBeLessThanOrEqual(0.001) // never goes under the axle
  })
  it("starts and ends on the masses", () => {
    expect(path[0]).toEqual(leftTop)
    expect(path.at(-1)).toEqual(rightTop)
  })
})

describe("a block on a table pulled over a pulley at the edge", () => {
  it("meets the wheel at a true tangent and goes over the top to the hanging mass", () => {
    const edgeWheel = pulleyAtCorner({ x: 400, y: 200 }, "right", 20) // table's top-right corner
    expect(edgeWheel).toEqual({ cx: 420, cy: 180, r: 20 })
    const block = { x: 300, y: 165 } // string attached to the block's side, near the wheel's top
    const t = tangentPoint(block, edgeWheel)
    // A tangent is perpendicular to the radius.
    const radius = { x: t.x - 420, y: t.y - 180 }
    const string = { x: t.x - block.x, y: t.y - block.y }
    expect(radius.x * string.x + radius.y * string.y).toBeCloseTo(0)
    expect(t.y).toBeLessThan(180) // on the upper half
  })
})
