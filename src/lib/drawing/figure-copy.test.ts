import { describe, expect, it } from "vitest"
import {
  copySize, cropFor, expandBox, figureCrop, fromCropSpace, overlapArea, partOnCopy, snapBoxToInk, tightenToInk, tiltedRectIn,
  toCropSpace, trimProseFromFigure,
} from "./figure-copy"

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
  it("does not override the native-pixel cap for tiny figures", () => {
    expect(copySize({ x: 0, y: 0, w: 20, h: 10 }, 600, 20)).toEqual({ w: 40, h: 20 })
  })
  it("preserves feature positions through an existing crop and a resized copy", () => {
    const source = { x: 125.5, y: -40.25, w: 800, h: 400 }
    const area = { x: 325.5, y: 59.75, w: 200, h: 200 }
    const crop = cropFor(area, source, { topLeft: { x: .2, y: .1 }, bottomRight: { x: .8, y: .9 } })
    const copy = { x: 1500, y: 100, w: 320, h: 320 }
    const feature = { x: 375.5, y: 109.75, w: 50, h: 50 }
    const mapped = partOnCopy(feature, area, copy)
    // Full 2000px source: crop x=.35, feature x=.3875; map through the visible copy.
    const pixelX = .3875 * 2000, cropX = crop.topLeft.x * 2000
    const cropWidth = (crop.bottomRight.x - crop.topLeft.x) * 2000
    expect(mapped.x).toBeCloseTo(copy.x + (pixelX - cropX) / cropWidth * copy.w)
    expect(mapped).toEqual({ x: 1580, y: 180, w: 80, h: 80 })
  })
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

describe("figureCrop (bug: lift diagram beside its text was cut to a sliver)", () => {
  // A 1000x1000 px photo laid out like the lift question: the diagram on the left
  // (a cable from y=80, the lift box 250-650, a "55 kg" crate inside it) and the
  // question's sentences in a column to its right, on the same rows. OCR merges the
  // crate's "55 kg" into the sentence beside it, so that line starts inside the figure.
  const sentence = (line: number, y: number, x0 = 260) =>
    Array.from({ length: 8 }, (_, i) => ({ x0: x0 + i * 90, y0: y, x1: x0 + i * 90 + 80, y1: y + 30, line }))
  const words = [
    ...Array.from({ length: 12 }, (_, i) => sentence(i, 100 + i * 50)).flat(),
    { x0: 70, y0: 560, x1: 130, y1: 590, line: 9 }, // "55 kg", merged into line 9 (y=550)
  ]
  const ocr = { width: 1000, height: 1000, words }
  const lift = [250, 20, 650, 200] as const
  const crate = [520, 60, 640, 140] as const

  it("keeps every named part of the figure inside the crop", () => {
    const crop = figureCrop([80, 0, 700, 230], [lift, crate], ocr)
    expect(crop[0]).toBeLessThanOrEqual(250)
    expect(crop[1]).toBeLessThanOrEqual(20)
    expect(crop[2]).toBeGreaterThanOrEqual(650)
    expect(crop[3]).toBeGreaterThanOrEqual(200)
  })

  it("never lets the prose trim reduce a figure to a sliver, even without parts", () => {
    const [top, left, bottom, right] = figureCrop([80, 0, 700, 230], [], ocr)
    expect((bottom - top) * (right - left)).toBeGreaterThan(0.5 * 620 * 230)
  })

  it("grows the crop to take in a part the model boxed outside its figure box", () => {
    const crop = figureCrop([300, 20, 600, 200], [[250, 20, 650, 200]], undefined)
    expect(crop).toEqual([250, 20, 650, 200])
  })

  it("still trims a whole-question box down to the figure below the text", () => {
    const below = { width: 1000, height: 1000, words: [...sentence(0, 20, 20), ...sentence(1, 70, 20)] }
    const [top] = figureCrop([0, 0, 1000, 1000], [], below)
    expect(top).toBeGreaterThanOrEqual(100)
  })
})

describe("figureCrop never cuts a drawn object in half (bug: pulley masses sliced off at the bottom)", () => {
  // 100x100 ink grid (one cell = 10 units): a pulley wheel at rows 10-25, strings down cols 30 and 60,
  // and two circular masses at rows 70-85 hanging on them. The model's box stops at row 78 - mid-mass.
  const cells = new Uint8Array(100 * 100)
  const set = (r: number, c: number) => (cells[r * 100 + c] = 1)
  for (let c = 30; c <= 60; c++) { set(10, c); set(25, c) }
  for (let r = 25; r < 70; r++) { set(r, 30); set(r, 60) }
  for (const [c0, c1] of [[22, 38], [52, 68]]) for (let r = 70; r <= 85; r++) for (let c = c0; c <= c1; c++) if (r === 70 || r === 85 || c === c0 || c === c1) set(r, c)
  const ocr = { width: 1000, height: 1000, words: [], ink: { cols: 100, rows: 100, cells } }

  it("pushes the bottom edge past both masses onto blank paper", () => {
    const [, , bottom] = figureCrop([80, 200, 780, 700], [], ocr)
    expect(bottom).toBeGreaterThanOrEqual(860)
  })

  it("leaves an edge that already sits on blank paper where it is (plus its margin)", () => {
    const [top, left, , right] = figureCrop([80, 200, 780, 700], [], ocr)
    expect(top).toBeLessThanOrEqual(100)
    expect(left).toBeLessThanOrEqual(220)
    expect(right).toBeGreaterThanOrEqual(690)
  })
})

describe("copySize never blows a small photo up into a blur", () => {
  it("caps the copy at twice the figure's real pixels", () => {
    // A 300-unit-wide figure that is only 120 real pixels wide in the photo.
    expect(copySize({ x: 0, y: 0, w: 300, h: 150 }, undefined, 120).w).toBe(240)
  })
  it("still enlarges a sharp figure for annotating", () => {
    expect(copySize({ x: 0, y: 0, w: 300, h: 150 }, undefined, 900).w).toBe(480)
  })
})

describe("crop-space mapping for the second look", () => {
  it("round-trips a part box through the figure crop", () => {
    const crop = expandBox([200, 100, 600, 500], 0.1) // [160, 60, 640, 540]
    expect(crop).toEqual([160, 60, 640, 540])
    const part = [400, 200, 500, 300] as const
    const inCrop = toCropSpace(part, crop)
    fromCropSpace(inCrop, crop).forEach((v, i) => expect(v).toBeCloseTo(part[i], 6))
  })
  it("keeps the expanded crop inside the image", () => {
    expect(expandBox([10, 950, 300, 1000], 0.2)).toEqual([0, 940, 358, 1000])
  })
})

describe("snapBoxToInk", () => {
  // A 100x100 ink grid over the image (one cell = 10 units on the 0-1000 scale):
  // a block outlined at rows 52-63, cols 30-45, with a string rising from its top.
  const cells = new Uint8Array(100 * 100)
  const set = (r: number, c: number) => (cells[r * 100 + c] = 1)
  for (let c = 30; c <= 45; c++) { set(52, c); set(63, c) }
  for (let r = 52; r <= 63; r++) { set(r, 30); set(r, 45) }
  for (let r = 20; r < 52; r++) set(r, 37)
  const ink = { cols: 100, rows: 100, cells }

  it("snaps a loosely-estimated box onto the block's drawn outline", () => {
    expect(snapBoxToInk([500, 280, 610, 470], ink)).toEqual([520, 300, 640, 460])
  })

  it("ignores a string attached to the block", () => {
    expect(snapBoxToInk([530, 300, 640, 460], ink)[0]).toBe(520)
  })

  it("leaves a box alone where there's no drawn edge to snap to", () => {
    expect(snapBoxToInk([50, 700, 150, 900], ink)).toEqual([50, 700, 150, 900])
    expect(snapBoxToInk([500, 280, 610, 470], undefined)).toEqual([500, 280, 610, 470])
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
