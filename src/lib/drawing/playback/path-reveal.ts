import type { Point } from "../protocol"

/** Reveal by distance, including an interpolated endpoint on two-point wires. */
export function revealPath(points: readonly Point[], progress: number): Point[] {
  if (points.length < 2 || progress >= 1) return points.map((point) => ({ ...point }))
  const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, progress)
  const result = [{ ...points[0] }]
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]
    if (length === 0) continue
    if (remaining >= length) {
      result.push({ ...points[i + 1] })
      remaining -= length
    } else {
      const t = remaining / length
      result.push({ x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t })
      break
    }
  }
  if (result.length === 1) result.push({ ...result[0] })
  return result
}
