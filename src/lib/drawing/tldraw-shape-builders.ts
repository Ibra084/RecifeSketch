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

/**
 * Builds the compressed `segments` prop for a `draw` shape from plain points.
 * A tldraw "straight" segment is one edge between exactly two points (any
 * further points are ignored), so straight-sided outlines get one segment per
 * edge - plus the edge back to the start when `closed`, which tldraw does not
 * add for straight segments. A freehand stroke is one segment through every point.
 */
export function buildDrawSegments(points: readonly PlainPoint[], type: "free" | "straight", closed = false) {
  const toPoint = (point: PlainPoint) => ({ x: point.x, y: point.y, z: 0.5 })
  if (type === "free" || points.length < 2) {
    return compressLegacySegments([{ type, points: points.map(toPoint) }])
  }
  const outline = closed && points.length > 2 ? [...points, points[0]] : points
  return compressLegacySegments(
    outline.slice(1).map((end, i) => ({ type: "straight" as const, points: [toPoint(outline[i]), toPoint(end)] }))
  )
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
