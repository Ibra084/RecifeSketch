import { describe, expect, it } from "vitest"
import { cameraMoveFor } from "./camera-follow"

const view = { x: 0, y: 0, w: 1000, h: 600 }

describe("cameraMoveFor", () => {
  it("stays put while the writing is readable and near the middle of the screen", () => {
    expect(cameraMoveFor(view, { x: 400, y: 250, w: 200, h: 100 }, 40)).toEqual({ kind: "none" })
  })

  it("re-centres on writing that has drifted towards the edge, even if it is still visible", () => {
    // Visible, but its centre (x=880) is in the right-hand fifth of the screen.
    expect(cameraMoveFor(view, { x: 830, y: 250, w: 100, h: 40 }, 40)).toEqual({ kind: "pan", center: { x: 880, y: 270 } })
  })

  it("moves the whole screen to writing that is off-screen", () => {
    expect(cameraMoveFor(view, { x: 1400, y: -300, w: 200, h: 60 }, 40)).toEqual({ kind: "pan", center: { x: 1500, y: -270 } })
  })

  it("zooms in on the writing when the board is zoomed out too far to read it", () => {
    // At 23% zoom the view shows a huge page area; the note is technically "in view" but unreadable.
    const farOut = { x: 0, y: 0, w: 1000 / 0.23, h: 600 / 0.23 }
    expect(cameraMoveFor(farOut, { x: 400, y: 250, w: 300, h: 60 }, 40, 0.23)).toEqual({
      kind: "fit",
      bounds: { x: 360, y: 210, w: 380, h: 140 },
    })
  })

  it("doesn't zoom in on something too big to read up close - it just keeps it in view", () => {
    const farOut = { x: 0, y: 0, w: 4000, h: 2400 }
    expect(cameraMoveFor(farOut, { x: 1000, y: 600, w: 2000, h: 1200 }, 40, 0.25)).toEqual({ kind: "none" })
  })

  it("zooms out to fit something bigger than the screen", () => {
    expect(cameraMoveFor(view, { x: 0, y: 0, w: 1500, h: 300 }, 40)).toEqual({ kind: "fit", bounds: { x: -40, y: -40, w: 1580, h: 380 } })
  })
})
