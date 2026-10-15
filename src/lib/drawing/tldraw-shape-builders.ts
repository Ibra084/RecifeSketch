/**
 * Shared, pure helpers for building tldraw shape props from plain point
 * arrays. Used by both `tldraw-adapter.ts` (to create the final object)
 * and `playback/tldraw-animator.ts` (to repeatedly update it mid-reveal
 * with a growing point subset) so the two never drift apart.
 */

import { compressLegacySegments, getIndices } from "tldraw"

export interface PlainPoint {
  x: number
  y: number
}

/** Builds the compressed `segments` prop for a `draw` shape from plain points. */
export function buildDrawSegments(points: readonly PlainPoint[], type: "free" | "straight") {
  return compressLegacySegments([
    {
      type,
      points: points.map((point) => ({ x: point.x, y: point.y, z: 0.5 })),
    },
  ])
}

/** Builds the `points` record (keyed by fractional index) for a `line` shape. */
export function buildLinePointsRecord(points: readonly PlainPoint[]) {
  const indices = getIndices(points.length)
  return Object.fromEntries(
    points.map((point, i) => [
      indices[i],
      { id: indices[i], index: indices[i], x: point.x, y: point.y },
    ])
  )
}
