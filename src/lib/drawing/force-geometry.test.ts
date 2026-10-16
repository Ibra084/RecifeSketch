import { describe, expect, it } from "vitest"
import { forceArrow, type ObjectFrame } from "./force-geometry"

const box: ObjectFrame = { cx: 100, cy: 100, w: 80, h: 40, rotation: 0, round: false }

describe("forceArrow", () => {
  it("starts on the outline and points the way the maths angle says (page y points down)", () => {
    expect(forceArrow(box, 0, 50)).toEqual({ start: { x: 140, y: 100 }, end: { x: 190, y: 100 } })
    const up = forceArrow(box, 90, 50)
    expect(up.start.x).toBeCloseTo(100)
    expect(up.start.y).toBeCloseTo(80)
    expect(up.end.y).toBeCloseTo(30)
    const down = forceArrow(box, 270, 50)
    expect(down.start.y).toBeCloseTo(120)
    expect(down.end.y).toBeCloseTo(170)
  })

  it("leaves a turned block's outline: a block on a 30° slope, normal reaction at 120°", () => {
    const block = { ...box, rotation: 30 }
    const { start, end } = forceArrow(block, 120, 60)
    // Perpendicular to the block's long side, so it starts half the block's height (20) from the centre.
    expect(Math.hypot(start.x - 100, start.y - 100)).toBeCloseTo(20)
    expect(end.x - start.x).toBeCloseTo(60 * Math.cos((120 * Math.PI) / 180))
    expect(end.y - start.y).toBeCloseTo(-60 * Math.sin((120 * Math.PI) / 180))
  })

  it("friction down a 30° slope starts on the block's short end", () => {
    const { start } = forceArrow({ ...box, rotation: 30 }, 210, 60)
    expect(Math.hypot(start.x - 100, start.y - 100)).toBeCloseTo(40)
  })

  it("follows a circle's outline", () => {
    const ball: ObjectFrame = { cx: 0, cy: 0, w: 60, h: 60, rotation: 0, round: true }
    const { start } = forceArrow(ball, 45, 40)
    expect(Math.hypot(start.x, start.y)).toBeCloseTo(30)
  })
})
