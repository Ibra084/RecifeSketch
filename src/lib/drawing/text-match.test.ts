import { describe, expect, it } from "vitest"
import { findPhrase, normalizeToken, pixelRectToPage, type OcrResult } from "./text-match"

// "A child is dragging a toy at a constant / speed along a flat floor." - wrapped over two lines.
const ocr: OcrResult = {
  width: 1000, height: 200,
  words: [
    { text: "A", x0: 10, y0: 10, x1: 22, y1: 40, line: 0 },
    { text: "child", x0: 30, y0: 10, x1: 100, y1: 40, line: 0 },
    { text: "is", x0: 108, y0: 10, x1: 130, y1: 40, line: 0 },
    { text: "dragging", x0: 138, y0: 10, x1: 260, y1: 40, line: 0 },
    { text: "a", x0: 268, y0: 10, x1: 280, y1: 40, line: 0 },
    { text: "toy", x0: 288, y0: 10, x1: 330, y1: 40, line: 0 },
    { text: "at", x0: 338, y0: 10, x1: 360, y1: 40, line: 0 },
    { text: "a", x0: 368, y0: 10, x1: 380, y1: 40, line: 0 },
    { text: "constant", x0: 388, y0: 10, x1: 500, y1: 40, line: 0 },
    { text: "speeci", x0: 10, y0: 60, x1: 90, y1: 92, line: 1 }, // OCR slip for "speed"
    { text: "along", x0: 98, y0: 60, x1: 170, y1: 92, line: 1 },
    { text: "a", x0: 178, y0: 60, x1: 190, y1: 92, line: 1 },
    { text: "flat", x0: 198, y0: 60, x1: 250, y1: 92, line: 1 },
    { text: "floor.", x0: 258, y0: 60, x1: 330, y1: 92, line: 1 },
  ],
}

describe("findPhrase", () => {
  it("returns the exact pixel box of a single keyword", () => {
    expect(findPhrase(ocr, "dragging")).toEqual([{ x: 138, y: 10, w: 122, h: 30 }])
  })
  it("ignores case and punctuation around words", () => {
    expect(findPhrase(ocr, "Floor")).toEqual([{ x: 258, y: 60, w: 72, h: 32 }])
  })
  it("highlights a phrase that wraps onto the next line with one box per line", () => {
    expect(findPhrase(ocr, "constant speed")).toEqual([
      { x: 388, y: 10, w: 112, h: 30 },
      { x: 10, y: 60, w: 80, h: 32 },
    ])
  })
  it("tolerates a one-letter OCR slip in a longer word, but not in short ones", () => {
    expect(findPhrase(ocr, "speed")).not.toBeNull()
    expect(findPhrase(ocr, "ton")).toBeNull()
  })
  it("picks the requested occurrence of a repeated word", () => {
    expect(findPhrase(ocr, "a", 2)).toEqual([{ x: 268, y: 10, w: 12, h: 30 }])
  })
  it("says so when the phrase isn't in the image", () => {
    expect(findPhrase(ocr, "frictionless surface")).toBeNull()
  })
})

describe("normalizeToken / pixelRectToPage", () => {
  it("normalizes words for matching", () => {
    expect(normalizeToken("Speed,")).toBe("speed")
    expect(normalizeToken("6.0°")).toBe("60")
  })
  it("maps image pixels onto the board region the image fills", () => {
    // A 1000x200 px recognition of an image shown 500x100 on the board at (40, 60).
    expect(pixelRectToPage({ x: 138, y: 10, w: 122, h: 30 }, ocr, { x: 40, y: 60, w: 500, h: 100 }))
      .toEqual({ x: 109, y: 65, w: 61, h: 15 })
  })
})
