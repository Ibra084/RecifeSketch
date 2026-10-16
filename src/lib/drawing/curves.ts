import type { DrawCurveAction, DrawRepeatedCurveAction, DrawLineAction, Point } from "./protocol"

/** Bounded cubic Bézier sampling: geometry data only, never executable model code. */
export function curveToLine(action: DrawCurveAction): DrawLineAction {
  const points: Point[] = [{ ...action.start }]
  let start = action.start
  for (const segment of action.segments) {
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, u = 1 - t
      points.push({
        x: u ** 3 * start.x + 3 * u * u * t * segment.c1.x + 3 * u * t * t * segment.c2.x + t ** 3 * segment.end.x,
        y: u ** 3 * start.y + 3 * u * u * t * segment.c1.y + 3 * u * t * t * segment.c2.y + t ** 3 * segment.end.y,
      })
    }
    start = segment.end
  }
  return { type: "draw_line", id: action.id, points, color: action.color, size: action.size, dash: action.dash ?? "solid" }
}

/** A repeated geometric motif, usable for windings, springs and conceptual waves. */
export function repeatedCurveToLine(action: DrawRepeatedCurveAction): DrawLineAction {
  const dx = action.end.x - action.start.x, dy = action.end.y - action.start.y
  const length = Math.hypot(dx, dy)
  const ux = dx / length, uy = dy / length
  const samples = action.cycles * 24
  const points = Array.from({ length: samples + 1 }, (_, i) => {
    if (i === 0) return { ...action.start }
    if (i === samples) return { ...action.end }
    const t = i / samples, angle = 2 * Math.PI * action.cycles * t
    const along = length * t + (action.profile === "loops" ? length / action.cycles * 0.65 * (Math.cos(angle) - 1) : 0)
    const across = action.amplitude * Math.sin(angle)
    return { x: action.start.x + ux * along - uy * across, y: action.start.y + uy * along + ux * across }
  })
  return { type: "draw_line", id: action.id, points, color: action.color, size: action.size ?? "s", dash: "solid" }
}
