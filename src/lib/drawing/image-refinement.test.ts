import { describe, expect, it } from "vitest"
import { adaptiveInk, refineImageBox } from "./image-refinement"

describe("measured image targeting (synthetic guesses, not recorded model output)", () => {
  for (const [name, rx, ry] of [["mechanics mass", 20, 20], ["biology cell", 35, 20], ["geometry circle", 28, 28], ["circuit component", 30, 12], ["graph feature", 12, 30]] as const) {
    it(`${name}: improves placement on shaded, ruled paper`, () => {
      const size = 200
      const luma = Float32Array.from({ length: size * size }, (_, i) => 250 - Math.floor(i / size) * .55 - (Math.floor(i / size) % 20 === 0 ? 12 : 0))
      let x0 = size, y0 = size, x1 = 0, y1 = 0
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const r = Math.hypot((x - 100) / rx, (y - 100) / ry)
        if (r >= .9 && r <= 1) {
          luma[y * size + x] = 25
          x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1)
        }
      }
      const truth = [y0, x0, y1, x1]
      const guess = truth.map(v => (v + 4) * 5)
      const refined = refineImageBox(guess, adaptiveInk(luma, size, size)).map(v => v / 5)
      const error = Math.max(...refined.map((v, i) => Math.abs(v - truth[i])))
      console.info(`${name}: maximum edge error 4px -> ${error.toFixed(2)}px`)
      expect(error).toBeLessThanOrEqual(1)
    })
  }
  it("does not invent features on a smooth shadow or faint ruled line", () => {
    const ink = adaptiveInk(Float32Array.from({ length: 40000 }, (_, i) => 250 - Math.floor(i / 200) * .6 - (Math.floor(i / 200) % 20 === 0 ? 12 : 0)), 200, 200)
    expect(Array.from(ink.cells).some(Boolean)).toBe(false)
  })
  it("retains the guess when a connected stroke leaves the search window", () => {
    const cells = new Uint8Array(10000)
    for (let x = 0; x < 100; x++) cells[50 * 100 + x] = 1
    const guess = [480, 400, 520, 600] as const
    expect(refineImageBox(guess, { cols: 100, rows: 100, cells })).toEqual(guess)
  })
  it("locates a closed mass outline even when attached to a long string", () => {
    const cells = new Uint8Array(40000)
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
      const radius = Math.hypot(x - 100, y - 120)
      if ((radius >= 19 && radius <= 21) || (x === 100 && y < 101)) cells[y * 200 + x] = 1
    }
    const refined = refineImageBox([515, 415, 725, 625], { cols: 200, rows: 200, cells }).map(v => v / 5)
    expect(Math.max(...refined.map((v, i) => Math.abs(v - [99, 79, 142, 122][i])))).toBeLessThanOrEqual(3)
  })
})
