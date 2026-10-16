import { describe, expect, it } from "vitest"
import { boxOutline, circleOutline, imageBoxToPage, underlineFor } from "./image-marks"

const region = { x: 100, y: 200, w: 600, h: 800 } // where the image sits on the board

describe("imageBoxToPage", () => {
  it("maps [ymin, xmin, ymax, xmax] on a 0-1000 scale onto the image's board rectangle", () => {
    expect(imageBoxToPage([250, 500, 500, 750], region)).toEqual({ x: 400, y: 400, w: 150, h: 200 })
  })
  it("covers the whole image for the full box", () => {
    expect(imageBoxToPage([0, 0, 1000, 1000], region)).toEqual(region)
  })
})

describe("outlines", () => {
  const target = { x: 0, y: 0, w: 100, h: 40 }
  it("box hugs the target with a small margin", () => {
    expect(boxOutline(target)).toEqual({ x: -4, y: -4, w: 108, h: 48 })
  })
  it("circle encloses all four corners of the target", () => {
    const e = circleOutline(target)
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, rx = e.w / 2, ry = e.h / 2
    const corner = ((0 - cx) / rx) ** 2 + ((0 - cy) / ry) ** 2
    expect(corner).toBeLessThanOrEqual(1)
    expect(cx).toBe(50)
    expect(cy).toBe(20)
  })
  it("underline runs the target's width just below it", () => {
    expect(underlineFor(target)).toEqual({ start: { x: 0, y: 43 }, end: { x: 100, y: 43 } })
  })
})
