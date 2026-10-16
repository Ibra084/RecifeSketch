import { describe, expect, it } from "vitest"
import { copySize, cropFor, overlapArea, partOnCopy, tightenToInk, tiltedRectIn, trimProseFromFigure } from "./figure-copy"

// The question photo shown at (100, 100), 800 x 400 on the board; its figure is the lower-left area.
const shown = { x: 100, y: 100, w: 800, h: 400 }
const figure = { x: 200, y: 260, w: 160, h: 200 }

describe("cropFor", () => {
  it("crops the image file to exactly the figure's area", () => {
    expect(cropFor(figure, shown, null)).toEqual({ topLeft: { x: 0.125, y: 0.4 }, bottomRight: { x: 0.325, y: 0.9 } })
  })
  it("composes with a crop the photo already had", () => {
    const already = { topLeft: { x: 0.5, y: 0 }, bottomRight: { x: 1, y: 0.5 } } // the shown image is the top-right quarter of the file
    const c = cropFor(figure, shown, already)
    expect(c.topLeft.x).toBeCloseTo(0.5625)
    expect(c.topLeft.y).toBeCloseTo(0.2)
    expect(c.bottomRight.x).toBeCloseTo(0.6625)
    expect(c.bottomRight.y).toBeCloseTo(0.45)
  })
  it("never crops outside the image", () => {
    const c = cropFor({ x: 0, y: 0, w: 2000, h: 2000 }, shown, null)
    expect(c).toEqual({ topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } })
  })
})

describe("copySize and partOnCopy", () => {
  it("enlarges the copy, keeping the figure's shape", () => {
    expect(copySize(figure)).toEqual({ w: 360, h: 450 })
    expect(copySize(figure, 480)).toEqual({ w: 480, h: 600 })
  })
  it("puts each named part at the same place on the copy as on the original", () => {
    const copy = { x: 1000, y: 100, w: 320, h: 400 } // 2x the figure
    const mass = { x: 240, y: 400, w: 40, h: 40 } // in the original figure
    expect(partOnCopy(mass, figure, copy)).toEqual({ x: 1080, y: 380, w: 80, h: 80 })
  })
  it("measures overlap for picking the photo the figure is in", () => {
    expect(overlapArea(figure, shown)).toBe(160 * 200)
    expect(overlapArea(figure, { x: 0, y: 0, w: 10, h: 10 })).toBe(0)
  })
})

describe("tiltedRectIn", () => {
  it("recovers a tilted block's own size from its bounding box", () => {
    // A 100 x 60 block turned 30°: bounding box 100cos30 + 60sin30 = 116.6 wide, 100sin30 + 60cos30 = 102 tall.
    const W = 100 * Math.cos(Math.PI / 6) + 60 * Math.sin(Math.PI / 6)
    const H = 100 * Math.sin(Math.PI / 6) + 60 * Math.cos(Math.PI / 6)
    const r = tiltedRectIn({ x: 0, y: 0, w: W, h: H }, 30)!
    expect(r.w).toBeCloseTo(100)
    expect(r.h).toBeCloseTo(60)
    expect(r.centre).toEqual({ x: W / 2, y: H / 2 })
  })
  it("gives up when the box can't hold a tilted rectangle", () => {
    expect(tiltedRectIn({ x: 0, y: 0, w: 100, h: 100 }, 45)).toBeNull()
    expect(tiltedRectIn({ x: 0, y: 0, w: 10, h: 200 }, 30)).toBeNull()
  })
})

describe("trimProseFromFigure", () => {
  // A 1000x1000 px question photo: two lines of question text on top, the figure below with a "3 kg" label in it.
  const words = (line: number, y: number, xs: number[]) => xs.map((x) => ({ x0: x, y0: y, x1: x + 80, y1: y + 30, line }))
  const ocr = {
    width: 1000, height: 1000,
    words: [
      ...words(0, 20, [20, 120, 220, 320, 420, 520, 620, 720]), // "A light inextensible string passes over a fixed..."
      ...words(1, 70, [20, 120, 220, 320, 420, 520]),
      ...words(2, 600, [300]), // "3 kg", inside the figure
    ],
  }
  it("cuts the question's text off a figure box that swallowed the whole question", () => {
    const [top, left, bottom, right] = trimProseFromFigure([0, 0, 1000, 1000], ocr)
    expect(top).toBeGreaterThanOrEqual(100) // starts below both lines of text
    expect([left, bottom, right]).toEqual([0, 1000, 1000]) // and keeps the rest of the figure
  })
  it("keeps labels that belong to the figure", () => {
    const trimmed = trimProseFromFigure([400, 100, 900, 700], ocr)
    expect(trimmed).toEqual([400, 100, 900, 700]) // "3 kg" isn't prose - nothing to cut
  })
  it("leaves a tight figure box alone", () => {
    expect(trimProseFromFigure([300, 50, 800, 500], ocr)).toEqual([300, 50, 800, 500])
  })
})

describe("tightenToInk", () => {
  // A 10x10 ink grid over the image with ink only in cells (row 5-7, col 1-3): the figure.
  const cells = new Uint8Array(100)
  for (let r = 5; r <= 7; r++) for (let c = 1; c <= 3; c++) cells[r * 10 + c] = 1
  const ink = { cols: 10, rows: 10, cells }
  it("crops to the figure's ink with a small margin, dropping the blank paper", () => {
    expect(tightenToInk([150, 0, 1000, 1000], ink)).toEqual([485, 85, 815, 415])
  })
  it("leaves the box alone when there's no ink map or no ink in it", () => {
    expect(tightenToInk([0, 600, 300, 900], ink)).toEqual([0, 600, 300, 900])
    expect(tightenToInk([0, 0, 1000, 1000], undefined)).toEqual([0, 0, 1000, 1000])
  })
})
