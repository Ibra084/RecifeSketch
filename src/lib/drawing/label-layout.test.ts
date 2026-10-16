import { expect, it } from "vitest"
import { placeLabel } from "./label-layout"

it("places a long label outside a very narrow symbol without changing its width", () => {
  const owner = { x: 50, y: 50, w: 20, h: 200 }
  const result = placeLabel(owner, { w: 180, h: 24 }, [owner])
  expect(result).toEqual({ x: -30, y: 264, w: 180, h: 24 })
})
it("does not cover another label or symbol", () => {
  const owner = { x: 100, y: 100, w: 100, h: 50 }
  const below = { x: 80, y: 160, w: 200, h: 40 }
  const placed = placeLabel(owner, { w: 140, h: 24 }, [owner, below])
  expect(placed.y + placed.h).toBeLessThan(owner.y)
})
it("accepts measured bounds without leaking their old position into the new one", () => {
  const bounds = { x: 999, y: 999, w: 140, h: 24 }
  expect(placeLabel({ x: 0, y: 0, w: 100, h: 50 }, bounds, []).x).toBe(-20)
})
