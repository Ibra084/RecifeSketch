import { describe, expect, it } from "vitest"
import { cameraMoveFor } from "./camera-follow"

const view = { x: 0, y: 0, w: 1000, h: 600 }

describe("cameraMoveFor", () => {
  it("stays put when the new drawing is already comfortably in view", () => {
    expect(cameraMoveFor(view, { x: 100, y: 100, w: 200, h: 100 }, 40)).toEqual({ kind: "none" })
  })
  it("pans only as far as needed to bring an off-screen drawing into view", () => {
    // Right edge of the padded target is at 1240, 240 past the view's right edge.
    expect(cameraMoveFor(view, { x: 900, y: 100, w: 300, h: 100 }, 40)).toEqual({ kind: "pan", center: { x: 740, y: 300 } })
  })
  it("pans up and left too", () => {
    expect(cameraMoveFor(view, { x: -300, y: -200, w: 100, h: 50 }, 40)).toEqual({ kind: "pan", center: { x: 160, y: 60 } })
  })
  it("zooms out to fit something bigger than the screen", () => {
    expect(cameraMoveFor(view, { x: 0, y: 0, w: 1500, h: 300 }, 40)).toEqual({ kind: "fit", bounds: { x: -40, y: -40, w: 1580, h: 380 } })
  })
})
