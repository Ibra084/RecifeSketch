export interface LabelBox { x: number; y: number; w: number; h: number }

/** What a label must stay clear of: boxes, or a test for exact shapes (e.g. a thin slope outline, not its whole bounding box). */
export type LabelObstacles = LabelBox[] | ((box: LabelBox) => boolean)

function overlaps(a: LabelBox, b: LabelBox, gap = 8) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}

function isBlocked(obstacles: LabelObstacles, box: LabelBox, gap = 8): boolean {
  return typeof obstacles === "function" ? obstacles(box) : obstacles.some(other => overlaps(box, other, gap))
}

/**
 * An arrow's label goes just past its arrowhead, as in a textbook force
 * diagram - or beside the tip, or beside the shaft's middle, if that's taken.
 * `obstacles` should not include the arrow itself.
 */
export function placeArrowLabel(
  start: { x: number; y: number },
  end: { x: number; y: number },
  size: { w: number; h: number },
  obstacles: LabelObstacles
): LabelBox | undefined {
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  if (length < 1) return undefined
  const dx = (end.x - start.x) / length
  const dy = (end.y - start.y) / length
  // How far the label's centre must sit from a point so the label clears it along a direction.
  const reach = (ux: number, uy: number) => Math.abs(ux) * size.w / 2 + Math.abs(uy) * size.h / 2 + 8
  const at = (cx: number, cy: number) => ({ x: cx - size.w / 2, y: cy - size.h / 2, ...size })
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
  const candidates = [
    at(end.x + dx * reach(dx, dy), end.y + dy * reach(dx, dy)),
    at(end.x - dy * reach(-dy, dx), end.y + dx * reach(-dy, dx)),
    at(end.x + dy * reach(dy, -dx), end.y - dx * reach(dy, -dx)),
    at(mid.x - dy * reach(-dy, dx), mid.y + dx * reach(-dy, dx)),
    at(mid.x + dy * reach(dy, -dx), mid.y - dx * reach(dy, -dx)),
  ]
  return candidates.find((candidate) => !isBlocked(obstacles, candidate, 4))
}

/** Labels are outside symbols, with measured dimensions and deterministic spacing. */
export function placeLabel(owner: LabelBox, size: { w: number; h: number }, obstacles: LabelObstacles, above = false): LabelBox {
  size = { w: size.w, h: size.h }
  for (let ring = 0; ring < 24; ring++) {
    const gap = 14 + ring * (size.h + 12)
    const candidates = [
      { x: owner.x + (owner.w - size.w) / 2, y: owner.y + owner.h + gap, ...size },
      { x: owner.x + (owner.w - size.w) / 2, y: owner.y - size.h - gap, ...size },
      { x: owner.x + owner.w + gap, y: owner.y + (owner.h - size.h) / 2, ...size },
      { x: owner.x - size.w - gap, y: owner.y + (owner.h - size.h) / 2, ...size },
    ]
    if (above) [candidates[0], candidates[1]] = [candidates[1], candidates[0]]
    const clear = candidates.find(candidate => !isBlocked(obstacles, candidate))
    if (clear) return clear
  }
  // A crowded diagram still gets readable text in an unoccupied margin.
  const bottoms = typeof obstacles === "function" ? [] : obstacles.map(box => box.y + box.h)
  return { x: owner.x, y: Math.max(owner.y + owner.h, ...bottoms) + 20, ...size }
}
