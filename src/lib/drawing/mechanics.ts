/**
 * Connected mechanisms - pulleys, hanging masses and strings - done exactly.
 * A string is described by what it connects ("from A, over pulley P, to B")
 * and its path is computed: it leaves each object's outline, meets the
 * pulley wheel at the true tangent points and wraps over the top. Hanging
 * masses sit exactly under the side of the wheel, so their strings are
 * vertical. The model never places a string end by guesswork.
 *
 * Page coordinates: y points down.
 */

export interface Pt { x: number; y: number }
export interface Wheel { cx: number; cy: number; r: number }

/** Where a mass hangs: centred under the wheel's left or right edge, `drop` below the wheel's centre (to the mass's top). */
export function hangingMassCentre(wheel: Wheel, side: "left" | "right", drop: number, massHeight: number): Pt {
  return { x: wheel.cx + (side === "left" ? -wheel.r : wheel.r), y: wheel.cy + drop + massHeight / 2 }
}

/**
 * The tangent point on the wheel for a string coming from `p`, on the side
 * that takes the string over the TOP of the wheel (as a pulley is used).
 * A point directly below the wheel's edge gets that edge point exactly.
 */
export function tangentPoint(p: Pt, wheel: Wheel): Pt {
  const dx = p.x - wheel.cx
  const dy = p.y - wheel.cy
  const d = Math.hypot(dx, dy)
  if (d <= wheel.r + 1e-9) return { x: wheel.cx + (dx / (d || 1)) * wheel.r, y: wheel.cy + (dy / (d || 1)) * wheel.r }
  const base = Math.atan2(dy, dx)
  const spread = Math.acos(wheel.r / d)
  const candidates = [base + spread, base - spread].map((a) => ({ x: wheel.cx + wheel.r * Math.cos(a), y: wheel.cy + wheel.r * Math.sin(a) }))
  // The tangent the string arrives along, so that it then wraps over the top: the higher of the two (page y down).
  return candidates[0].y < candidates[1].y ? candidates[0] : candidates[1]
}

/** Points along the wheel from angle a0 to a1, going round over the top (through -π/2, page coordinates). */
function arcOverTop(wheel: Wheel, a0: number, a1: number, steps = 16): Pt[] {
  const TAU = Math.PI * 2
  const norm = (a: number) => ((a % TAU) + TAU) % TAU
  // Measure clockwise-on-screen (increasing angle) and anticlockwise sweeps; take the one containing the top.
  const top = norm(-Math.PI / 2)
  const start = norm(a0)
  const forward = norm(a1 - a0)
  const topForward = norm(top - start)
  const sweep = topForward <= forward ? forward : forward - TAU
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = start + (sweep * i) / steps
    return { x: wheel.cx + wheel.r * Math.cos(a), y: wheel.cy + wheel.r * Math.sin(a) }
  })
}

/**
 * The string's path from `a` to `b`, over `wheel` if given: straight to the
 * wheel, round over its top, straight on to `b`. Without a wheel it is a
 * straight line.
 */
export function stringPath(a: Pt, b: Pt, wheel?: Wheel): Pt[] {
  if (!wheel) return [a, b]
  const ta = tangentPoint(a, wheel)
  const tb = tangentPoint(b, wheel)
  const arc = arcOverTop(wheel, Math.atan2(ta.y - wheel.cy, ta.x - wheel.cx), Math.atan2(tb.y - wheel.cy, tb.x - wheel.cx))
  return [a, ...arc, b]
}

/** A pulley at a corner of an object (a table edge, the top of a slope): just beyond the corner, its top level with the corner. */
export function pulleyAtCorner(corner: Pt, outward: "left" | "right", r: number): Wheel {
  return { cx: corner.x + (outward === "right" ? r : -r), cy: corner.y - r, r }
}
