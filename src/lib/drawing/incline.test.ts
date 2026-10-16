import { describe, expect, it } from "vitest"
import { blockOnIncline, directionAngle, drawnSlopeAngle, inclineGeometry, outwardNormal } from "./incline"

/** Unit vector (maths orientation: y up) for a maths angle. */
const dir = (deg: number) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) })

describe("the question's slope: 6° downhill to the right (a car braking while going downhill)", () => {
  const slope = { drawnAngle: drawnSlopeAngle(6), downhill: "right" as const }

  it("draws a tiny angle steeper so it can be seen", () => {
    expect(slope.drawnAngle).toBe(15)
  })
  it("down the slope points right and down", () => {
    const d = dir(directionAngle("down_slope", slope))
    expect(d.x).toBeGreaterThan(0)
    expect(d.y).toBeLessThan(0)
  })
  it("up the slope (braking, friction on a car moving downhill) points left and up", () => {
    const d = dir(directionAngle("up_slope", slope))
    expect(d.x).toBeLessThan(0)
    expect(d.y).toBeGreaterThan(0)
  })
  it("the normal reaction points up and leans right, perpendicular to the slope", () => {
    const n = dir(directionAngle("normal", slope))
    const along = dir(directionAngle("down_slope", slope))
    expect(n.y).toBeGreaterThan(0.9)
    expect(n.x).toBeGreaterThan(0)
    expect(n.x * along.x + n.y * along.y).toBeCloseTo(0)
  })
  it("weight points straight down whatever the slope", () => {
    expect(directionAngle("down", slope)).toBe(270)
  })
})

describe("a slope going downhill to the left mirrors it", () => {
  const slope = { drawnAngle: 30, downhill: "left" as const }
  it("down the slope points left and down; up the slope right and up", () => {
    const down = dir(directionAngle("down_slope", slope))
    const up = dir(directionAngle("up_slope", slope))
    expect(down.x).toBeLessThan(0)
    expect(down.y).toBeLessThan(0)
    expect(up.x).toBeGreaterThan(0)
    expect(up.y).toBeGreaterThan(0)
    expect(directionAngle("up_slope", slope)).toBe(30)
  })
})

describe("inclineGeometry and blockOnIncline", () => {
  it("puts the high end and the angle on the correct sides", () => {
    const right = inclineGeometry({ x: 0, y: 0 }, 400, 30, "right")
    expect(right.top.x).toBe(0) // high on the left
    expect(right.corner.x).toBe(400) // angle at the bottom right
    const left = inclineGeometry({ x: 0, y: 0 }, 400, 30, "left")
    expect(left.top.x).toBe(400)
    expect(left.corner.x).toBe(0)
  })
  it("rests a block on the surface, tilted to match the slope", () => {
    const g = inclineGeometry({ x: 0, y: 0 }, 400, 30, "right")
    const { centre, rotation } = blockOnIncline(g, "right", 0.5, 80, 40)
    expect(rotation).toBe(-30) // tilted down to the right, like the slope
    // Its centre is 20 (half its height) out from the surface's midpoint, along the outward normal.
    const mid = { x: (g.bottom.x + g.top.x) / 2, y: (g.bottom.y + g.top.y) / 2 }
    const n = outwardNormal(30, "right")
    expect(centre.x).toBeCloseTo(mid.x + n.x * 20)
    expect(centre.y).toBeCloseTo(mid.y + n.y * 20)
    expect(centre.y).toBeLessThan(mid.y) // above the surface
  })
  it("refuses slope directions for an object that isn't on a slope", () => {
    expect(() => directionAngle("up_slope")).toThrow(/draw_on_incline/)
  })
})
