/**
 * Deterministic geometry for `draw_force`: where a force arrow on an object
 * starts and ends. The model gives an object and an angle; this does the
 * trigonometry, so arrows always leave the object's outline (even when the
 * object is turned, e.g. a block on a slope) and point exactly where meant.
 */

export interface ObjectFrame {
  /** Centre on the page. */
  cx: number
  cy: number
  /** Size before any turning. */
  w: number
  h: number
  /** Degrees, anticlockwise (maths convention), as `create_shape`'s rotation. */
  rotation: number
  /** Ellipse/circle outline rather than a rectangle. */
  round: boolean
}

export const DEFAULT_FORCE_LENGTH = 90

const toRadians = (degrees: number) => (degrees * Math.PI) / 180

/** Distance from the centre to the outline along a direction given in the object's own (unturned) frame. */
function distanceToOutline(frame: ObjectFrame, localX: number, localY: number): number {
  const hw = Math.max(frame.w / 2, 0.5)
  const hh = Math.max(frame.h / 2, 0.5)
  if (frame.round) return 1 / Math.hypot(localX / hw, localY / hh)
  const tx = Math.abs(localX) < 1e-9 ? Infinity : hw / Math.abs(localX)
  const ty = Math.abs(localY) < 1e-9 ? Infinity : hh / Math.abs(localY)
  return Math.min(tx, ty)
}

/**
 * Start and end of a force arrow on `frame`, pointing at `angle` (degrees,
 * anticlockwise from +x). Page y points down, so "up" is negative y.
 */
export function forceArrow(frame: ObjectFrame, angle: number, length = DEFAULT_FORCE_LENGTH) {
  const a = toRadians(angle)
  // Direction relative to the object's own axes (undo its turn), in maths orientation.
  const local = toRadians(angle - frame.rotation)
  const reach = distanceToOutline(frame, Math.cos(local), Math.sin(local))
  const dx = Math.cos(a)
  const dy = -Math.sin(a)
  const start = { x: frame.cx + dx * reach, y: frame.cy + dy * reach }
  return { start, end: { x: start.x + dx * length, y: start.y + dy * length } }
}
