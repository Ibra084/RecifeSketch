/**
 * Inclined planes, done exactly. A slope is described the way a question
 * describes it - its angle and which way is downhill - and everything else
 * is derived: the triangle, the angle marking, where a block sits on it and
 * how it's tilted, and which way "up the slope", "down the slope" and
 * "normal to the slope" point. The model never converts these to numbers.
 *
 * Page coordinates: y points down. Angles returned for forces are maths
 * convention (degrees anticlockwise from pointing right), as draw_force uses.
 */

export interface Pt { x: number; y: number }
export type Downhill = "left" | "right"

/** Slopes shallower than this are drawn at this angle (labelled with the true one), so they can be seen. */
export const MIN_DRAWN_SLOPE = 15

export function drawnSlopeAngle(angle: number): number {
  return Math.max(angle, MIN_DRAWN_SLOPE)
}

export interface InclineGeometry {
  /** The right-angled triangle: high corner, the right angle, the angle corner. */
  triangle: [Pt, Pt, Pt]
  /** Lower and upper ends of the sloping surface. */
  bottom: Pt
  top: Pt
  /** The corner where the slope meets the ground - where the angle is marked. */
  corner: Pt
  arc: Pt[]
  /** Centre for the angle's label. */
  labelCentre: Pt
  drawnAngle: number
}

const rad = (deg: number) => (deg * Math.PI) / 180

/** `position` is the top-left of the triangle's bounding box; `base` its horizontal length. */
export function inclineGeometry(position: Pt, base: number, angle: number, downhill: Downhill): InclineGeometry {
  const drawn = drawnSlopeAngle(angle)
  const h = base * Math.tan(rad(drawn))
  const { x, y } = position
  const r = Math.min(70, base * 0.2)
  if (downhill === "right") {
    // High on the left, running down to the angle at the bottom right.
    const corner = { x: x + base, y: y + h }
    // From the corner: the ground runs left (π); the slope runs up-left (π + θ, since page y points down).
    const arcPoints = arcFrom(corner, r, Math.PI, Math.PI + rad(drawn))
    return {
      triangle: [{ x, y }, { x, y: y + h }, corner],
      bottom: corner, top: { x, y }, corner, arc: arcPoints, drawnAngle: drawn,
      labelCentre: pointAt(corner, r + 26, Math.PI + rad(drawn) / 2),
    }
  }
  const corner = { x, y: y + h }
  // From the corner: the ground runs right (0); the slope runs up-right (-θ).
  const arcPoints = arcFrom(corner, r, -rad(drawn), 0)
  return {
    triangle: [{ x: x + base, y }, { x: x + base, y: y + h }, corner],
    bottom: corner, top: { x: x + base, y }, corner, arc: arcPoints, drawnAngle: drawn,
    labelCentre: pointAt(corner, r + 26, -rad(drawn) / 2),
  }
}

function pointAt(c: Pt, r: number, a: number): Pt {
  return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) }
}

function arcFrom(c: Pt, r: number, a0: number, a1: number, steps = 12): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => pointAt(c, r, a0 + ((a1 - a0) * i) / steps))
}

/**
 * Where a w x h block sits on the slope: its centre, `at` of the way from
 * the bottom of the slope to the top, resting on the surface; and its tilt
 * (degrees, anticlockwise - create_shape's rotation).
 */
export function blockOnIncline(g: InclineGeometry, downhill: Downhill, at: number, w: number, h: number): { centre: Pt; rotation: number } {
  const t = Math.min(0.95, Math.max(0.05, at))
  const surface = { x: g.bottom.x + (g.top.x - g.bottom.x) * t, y: g.bottom.y + (g.top.y - g.bottom.y) * t }
  const n = outwardNormal(g.drawnAngle, downhill)
  return {
    centre: { x: surface.x + n.x * h / 2, y: surface.y + n.y * h / 2 },
    rotation: downhill === "right" ? -g.drawnAngle : g.drawnAngle,
  }
}

/** Unit vector (page coordinates) pointing up out of the slope's surface. */
export function outwardNormal(drawnAngle: number, downhill: Downhill): Pt {
  const s = Math.sin(rad(drawnAngle))
  const c = Math.cos(rad(drawnAngle))
  return downhill === "right" ? { x: s, y: -c } : { x: -s, y: -c }
}

export const FORCE_DIRECTIONS = ["up_slope", "down_slope", "normal", "into_slope", "up", "down", "left", "right"] as const
export type ForceDirection = (typeof FORCE_DIRECTIONS)[number]

/**
 * A named direction as a maths angle. Slope-relative ones need the slope
 * the object rests on: for a slope at θ going downhill to the right,
 * down the slope is -θ, up it 180-θ, out of it (normal) 90-θ.
 */
export function directionAngle(direction: ForceDirection, slope?: { drawnAngle: number; downhill: Downhill }): number {
  switch (direction) {
    case "up": return 90
    case "down": return 270
    case "left": return 180
    case "right": return 0
  }
  if (!slope) throw new Error(`"${direction}" needs the object to be on a slope (place it with draw_on_incline), or give an angle instead`)
  const t = slope.drawnAngle
  const right = slope.downhill === "right"
  const angle = {
    down_slope: right ? -t : 180 + t,
    up_slope: right ? 180 - t : t,
    normal: right ? 90 - t : 90 + t,
    into_slope: right ? 270 - t : 270 + t,
  }[direction]
  return ((angle % 360) + 360) % 360
}
