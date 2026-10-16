import { describe, expect, it } from "vitest"
import { pagePoint, projectPoint, projectRect, pageRect, viewportPoint, viewportRect } from "./coordinates"
import { clampToViewport, placeOrbNear, placeSpeech, rectsOverlap } from "./placement"

const viewport = { w: 1000, h: 700 }

it("places the orb diagonally when all four sides of an anchor are blocked", () => {
  const anchor = viewportRect(460, 300, 80, 80)
  const occupied = [viewportRect(440, 0, 120, 700), viewportRect(0, 280, 1000, 120)]
  const orb = placeOrbNear(anchor, 56, viewport, occupied)
  expect(occupied.some(other => rectsOverlap(viewportRect(orb.x, orb.y, 56, 56), other))).toBe(false)
})

it("keeps the orb beside its anchor on a crowded board instead of jumping to a far corner", () => {
  const anchor = viewportRect(460, 300, 80, 80)
  const occupied = [viewportRect(0, 0, 1000, 640)] // everything but a strip at the bottom is drawn on
  const orb = placeOrbNear(anchor, 56, viewport, occupied)
  const gapX = Math.max(0, orb.x - (anchor.x + anchor.w), anchor.x - (orb.x + 56))
  const gapY = Math.max(0, orb.y - (anchor.y + anchor.h), anchor.y - (orb.y + 56))
  expect(Math.hypot(gapX, gapY)).toBeLessThanOrEqual(40)
})

describe("coordinate projection", () => {
  // A fake editor: camera at (-100,-50), zoom 2. Viewport = (page + cam) * z.
  const editor = { pageToViewport: (p: { x: number; y: number }) => ({ x: (p.x - 100) * 2, y: (p.y - 50) * 2 }) }

  it("projects a page point into viewport space through the camera", () => {
    expect(projectPoint(editor, pagePoint(150, 100))).toEqual(viewportPoint(100, 100))
  })

  it("projects a page rect by its corners, so zoom scales its size", () => {
    expect(projectRect(editor, pageRect(100, 50, 30, 20))).toEqual(viewportRect(0, 0, 60, 40))
  })
})

describe("clampToViewport", () => {
  it("keeps a box fully inside the viewport with a margin", () => {
    const clamped = clampToViewport(viewportRect(980, -40, 60, 60), viewport, 8)
    expect(clamped).toEqual(viewportPoint(1000 - 60 - 8, 8))
  })
})

describe("placeOrbNear", () => {
  it("sits beside the anchor instead of on top of it", () => {
    const anchor = viewportRect(500, 300, 120, 80)
    const orb = placeOrbNear(anchor, 56, viewport, [])
    const orbRect = viewportRect(orb.x, orb.y, 56, 56)
    expect(rectsOverlap(orbRect, anchor, 0)).toBe(false)
    expect(Math.abs(orb.x - anchor.x)).toBeLessThan(200)
  })

  it("avoids rects it is told to keep clear of", () => {
    const anchor = viewportRect(500, 300, 120, 80)
    const left = placeOrbNear(anchor, 56, viewport, [])
    const avoided = placeOrbNear(anchor, 56, viewport, [viewportRect(left.x - 10, left.y - 10, 80, 80)])
    expect(avoided).not.toEqual(left)
  })

  it("stays on screen when the anchor is at the edge", () => {
    const orb = placeOrbNear(viewportRect(0, 0, 40, 40), 56, viewport, [])
    expect(orb.x).toBeGreaterThanOrEqual(0)
    expect(orb.y).toBeGreaterThanOrEqual(0)
  })
})

describe("placeSpeech", () => {
  const orb = viewportRect(500, 300, 56, 56)
  const size = { w: 280, h: 80 }
  const boxAt = (p: { x: number; y: number }) => viewportRect(p.x, p.y, size.w, size.h)

  it("sits beside the orb, never on it", () => {
    const box = boxAt(placeSpeech(orb, size, [], viewport))
    expect(rectsOverlap(box, orb, 0)).toBe(false)
  })

  it("opens on the side away from what is being explained", () => {
    const content = viewportRect(580, 250, 300, 200) // to the orb's right
    const box = boxAt(placeSpeech(orb, size, [content], viewport))
    expect(rectsOverlap(box, content)).toBe(false)
    expect(box.x + box.w).toBeLessThanOrEqual(orb.x)
  })

  it("stays on screen when the orb is at an edge", () => {
    const box = boxAt(placeSpeech(viewportRect(10, 10, 56, 56), size, [], viewport))
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.w).toBeLessThanOrEqual(viewport.w)
  })
})
