import {
  viewportPoint,
  viewportRect,
  type ViewportPoint,
  type ViewportRect,
  type ViewportSize,
} from "./coordinates"

export function rectsOverlap(a: ViewportRect, b: ViewportRect, gap = 8): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}

function fitsInside(rect: ViewportRect, viewport: ViewportSize, margin: number): boolean {
  return rect.x >= margin && rect.y >= margin && rect.x + rect.w <= viewport.w - margin && rect.y + rect.h <= viewport.h - margin
}

/** Top-left that keeps a box of the rect's size fully on screen. */
export function clampToViewport(rect: ViewportRect, viewport: ViewportSize, margin = 8): ViewportPoint {
  const x = Math.min(Math.max(rect.x, margin), Math.max(margin, viewport.w - rect.w - margin))
  const y = Math.min(Math.max(rect.y, margin), Math.max(margin, viewport.h - rect.h - margin))
  return viewportPoint(x, y)
}

/** Candidate boxes around an anchor, nearest ring first: right, left, below, above, then the four corners. */
function candidatesAround(anchor: ViewportRect, size: ViewportSize, ring: number): ViewportRect[] {
  const gap = 16 + ring * 28
  const midY = anchor.y + (anchor.h - size.h) / 2
  const midX = anchor.x + (anchor.w - size.w) / 2
  const right = anchor.x + anchor.w + gap
  const left = anchor.x - size.w - gap
  const below = anchor.y + anchor.h + gap
  const above = anchor.y - size.h - gap
  return [
    viewportRect(right, midY, size.w, size.h),
    viewportRect(left, midY, size.w, size.h),
    viewportRect(midX, below, size.w, size.h),
    viewportRect(midX, above, size.w, size.h),
    viewportRect(right, below, size.w, size.h),
    viewportRect(right, above, size.w, size.h),
    viewportRect(left, below, size.w, size.h),
    viewportRect(left, above, size.w, size.h),
  ]
}

function overlapArea(a: ViewportRect, b: ViewportRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/**
 * The nearest clear spot beside the anchor. Searches outward only a short
 * distance: a bubble far from what it explains is worse than one that
 * partly covers other drawings, so on a crowded board it settles for the
 * adjacent spot that covers the least (never the anchor itself).
 */
function firstClearSpot(anchor: ViewportRect, size: ViewportSize, avoid: ViewportRect[], viewport: ViewportSize): ViewportRect {
  const blocked = [anchor, ...avoid]
  for (let ring = 0; ring < 6; ring++) {
    const clear = candidatesAround(anchor, size, ring).find(
      (box) => fitsInside(box, viewport, 8) && !blocked.some((other) => rectsOverlap(box, other))
    )
    if (clear) return clear
  }
  const adjacent = candidatesAround(anchor, size, 0).map((box) => {
    const pos = clampToViewport(box, viewport)
    return viewportRect(pos.x, pos.y, size.w, size.h)
  })
  const cost = (box: ViewportRect) =>
    overlapArea(box, anchor) * 4 + avoid.reduce((sum, other) => sum + overlapArea(box, other), 0)
  return adjacent.reduce((best, box) => (cost(box) < cost(best) ? box : best))
}

/** Where the companion orb should glide to: beside the anchor, never on top of it or the listed rects. */
export function placeOrbNear(anchor: ViewportRect, orbSize: number, viewport: ViewportSize, avoid: ViewportRect[]): ViewportPoint {
  // Prefer the left side, so the orb "points in" at content and leaves the right for its comment.
  const size = { w: orbSize, h: orbSize }
  const gap = 18
  const left = viewportRect(anchor.x - orbSize - gap, anchor.y + (anchor.h - orbSize) / 2, orbSize, orbSize)
  const blocked = [anchor, ...avoid]
  if (fitsInside(left, viewport, 8) && !blocked.some((other) => rectsOverlap(left, other, 4))) {
    return viewportPoint(left.x, left.y)
  }
  const spot = firstClearSpot(anchor, size, avoid, viewport)
  return viewportPoint(spot.x, spot.y)
}

/**
 * Where the orb's speech bubble goes: beside the orb - left, right, above,
 * then below - on screen and clear of `avoid` (what's being explained). If
 * no side is clear it takes the side that covers the least.
 */
export function placeSpeech(orb: ViewportRect, size: ViewportSize, avoid: ViewportRect[], viewport: ViewportSize): ViewportPoint {
  const gap = 10
  const midY = orb.y + (orb.h - size.h) / 2
  const midX = orb.x + (orb.w - size.w) / 2
  const sides = [
    viewportRect(orb.x - size.w - gap, midY, size.w, size.h),
    viewportRect(orb.x + orb.w + gap, midY, size.w, size.h),
    viewportRect(midX, orb.y - size.h - gap, size.w, size.h),
    viewportRect(midX, orb.y + orb.h + gap, size.w, size.h),
  ]
  const clear = sides.find((box) => fitsInside(box, viewport, 8) && !avoid.some((other) => rectsOverlap(box, other)))
  if (clear) return viewportPoint(clear.x, clear.y)
  const onScreen = sides.map((box) => {
    const pos = clampToViewport(box, viewport)
    return viewportRect(pos.x, pos.y, size.w, size.h)
  })
  const cost = (box: ViewportRect) =>
    overlapArea(box, orb) * 4 + avoid.reduce((sum, other) => sum + overlapArea(box, other), 0)
  const best = onScreen.reduce((a, b) => (cost(b) < cost(a) ? b : a))
  return viewportPoint(best.x, best.y)
}
