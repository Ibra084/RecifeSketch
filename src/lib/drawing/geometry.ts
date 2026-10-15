import type { ObjectBounds } from "./adapter"

/**
 * Pure spatial helpers for the drawing layer. Used to work out which
 * existing object an arrow visually touches, so a compact board summary
 * can report that relationship without needing a separate graph of its
 * own - the containment check against each object's live bounds is the
 * whole "relationship model".
 */

export function findContainingId(
  point: { x: number; y: number },
  candidates: readonly { id: string; bounds: ObjectBounds }[],
  excludeId: string,
  padding = 6
): string | undefined {
  for (const candidate of candidates) {
    if (candidate.id === excludeId) continue
    const { x, y, w, h } = candidate.bounds
    if (point.x >= x - padding && point.x <= x + w + padding && point.y >= y - padding && point.y <= y + h + padding) {
      return candidate.id
    }
  }
  return undefined
}
