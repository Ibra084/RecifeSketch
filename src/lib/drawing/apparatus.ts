/**
 * Standard school lab apparatus, generated as exact geometry from a few
 * parameters (where, how tall, how full). The adapter turns each part into
 * an ordinary, editable board shape and groups them - so a beaker is drawn
 * with real proportions every time, while the tutor still decides what to
 * draw and composes whole setups itself. Coordinates are page space, with
 * y pointing down; `x, y` is the top-left of the apparatus's bounding box.
 */

export const APPARATUS_KINDS = [
  "beaker", "conical_flask", "round_bottom_flask", "test_tube", "boiling_tube", "measuring_cylinder",
  "burette", "thermometer", "funnel", "evaporating_basin", "bunsen_burner", "tripod_gauze", "clamp_stand",
] as const
export type ApparatusKind = (typeof APPARATUS_KINDS)[number]

export interface Pt { x: number; y: number }

export interface ApparatusPart {
  points: Pt[]
  /** Joins the last point back to the first. */
  closed: boolean
  /** "liquid" parts are filled with the liquid colour; "flame" with orange; "body"/"detail" are outlines. */
  role: "body" | "detail" | "liquid" | "flame"
}

export interface ApparatusOptions {
  height?: number
  /** How full, 0-1 (vessels only). */
  fill?: number
  /** Bunsen burner only: draw a flame. */
  lit?: boolean
}

/** Width as a multiple of height, and the default height - so callers can size and centre a piece before building it. */
export const APPARATUS_SHAPE: Record<ApparatusKind, { widthRatio: number; defaultHeight: number; holdsLiquid: boolean }> = {
  beaker: { widthRatio: 0.8, defaultHeight: 180, holdsLiquid: true },
  conical_flask: { widthRatio: 0.78, defaultHeight: 200, holdsLiquid: true },
  round_bottom_flask: { widthRatio: 0.64, defaultHeight: 220, holdsLiquid: true },
  test_tube: { widthRatio: 0.18, defaultHeight: 160, holdsLiquid: true },
  boiling_tube: { widthRatio: 0.24, defaultHeight: 180, holdsLiquid: true },
  measuring_cylinder: { widthRatio: 0.42, defaultHeight: 260, holdsLiquid: true },
  burette: { widthRatio: 0.14, defaultHeight: 380, holdsLiquid: true },
  thermometer: { widthRatio: 0.12, defaultHeight: 220, holdsLiquid: true },
  funnel: { widthRatio: 0.62, defaultHeight: 160, holdsLiquid: false },
  evaporating_basin: { widthRatio: 2.4, defaultHeight: 70, holdsLiquid: true },
  bunsen_burner: { widthRatio: 0.72, defaultHeight: 180, holdsLiquid: false },
  tripod_gauze: { widthRatio: 0.95, defaultHeight: 140, holdsLiquid: false },
  clamp_stand: { widthRatio: 0.75, defaultHeight: 380, holdsLiquid: false },
}

const TAU = Math.PI * 2

/** Points along a circle's arc from angle a0 to a1 (radians, page orientation: y down, so π/2 is the bottom). */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, steps = 28): Pt[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / steps
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }
  })
}

/** Graduation ticks on the inside of a wall at x, between y0 (top) and y1 (bottom). */
function graduations(x: number, y0: number, y1: number, count: number, length: number, inward: 1 | -1): ApparatusPart[] {
  return Array.from({ length: count }, (_, i) => {
    const y = y1 - ((y1 - y0) * (i + 1)) / (count + 1)
    // Never shorter than 8: tldraw draws a very short stroke as a dot.
    const len = Math.max(8, i % 2 === 1 ? length : length * 0.55)
    return { points: [{ x, y }, { x: x + inward * len, y }], closed: false, role: "detail" as const }
  })
}

/** A liquid filling a straight-walled region from `bottom` up to `level`. */
function liquidBox(left: number, right: number, level: number, bottom: number, inset: number): ApparatusPart {
  return {
    points: [{ x: left + inset, y: level }, { x: right - inset, y: level }, { x: right - inset, y: bottom - inset }, { x: left + inset, y: bottom - inset }],
    closed: true,
    role: "liquid",
  }
}

/** A tube with a rounded bottom (test tube, boiling tube) - body outline and, if filled, the liquid in it. */
function roundBottomTube(x: number, y: number, w: number, h: number, fill: number): ApparatusPart[] {
  const r = w / 2
  const cx = x + r
  const cy = y + h - r
  const lip = w * 0.12
  // Lip, straight walls, then the round bottom: arc(π → 0) passes through π/2, the bottom (page y points down).
  const body: ApparatusPart = {
    points: [{ x: x - lip, y }, { x, y: y + lip * 0.6 }, { x, y: cy }, ...arc(cx, cy, r, r, Math.PI, 0), { x: x + w, y: y + lip * 0.6 }, { x: x + w + lip, y }],
    closed: false,
    role: "body",
  }
  const parts: ApparatusPart[] = [body]
  if (fill > 0) {
    const inset = 3
    const level = y + h - Math.max(r * 0.6, (h - lip) * fill)
    const ri = r - inset
    if (level >= cy) {
      const half = Math.sqrt(Math.max(0, ri * ri - (level - cy) ** 2))
      const aL = Math.atan2(level - cy, -half)
      const aR = Math.atan2(level - cy, half)
      parts.push({ points: arc(cx, cy, ri, ri, aL, aR, 20), closed: true, role: "liquid" })
    } else {
      parts.push({ points: [{ x: x + inset, y: level }, { x: x + inset, y: cy }, ...arc(cx, cy, ri, ri, Math.PI, 0, 24), { x: x + w - inset, y: level }], closed: true, role: "liquid" })
    }
  }
  return parts
}

export function buildApparatus(kind: ApparatusKind, x: number, y: number, options: ApparatusOptions = {}): ApparatusPart[] {
  const shape = APPARATUS_SHAPE[kind]
  const h = options.height ?? shape.defaultHeight
  const w = h * shape.widthRatio
  const fill = Math.min(1, Math.max(0, options.fill ?? 0))
  const inset = 3

  switch (kind) {
    case "beaker": {
      // Straight sides, flat base, a pouring spout at the top left and a small lip at the top right.
      const lipY = y + h * 0.05
      const parts: ApparatusPart[] = [
        { points: [{ x: x - w * 0.06, y }, { x, y: lipY }, { x, y: y + h }, { x: x + w, y: y + h }, { x: x + w, y: lipY }, { x: x + w + w * 0.03, y }], closed: false, role: "body" },
        ...graduations(x + w, y + h * 0.25, y + h * 0.95, 5, w * 0.16, -1),
      ]
      if (fill > 0) parts.push(liquidBox(x, x + w, y + h - (h - (lipY - y)) * fill, y + h, inset))
      return parts
    }
    case "conical_flask": {
      // Narrow neck, sloping shoulders, wide flat base.
      const neck = w * 0.28
      const cx = x + w / 2
      const neckBottom = y + h * 0.3
      const left = (yy: number) => cx - neck / 2 - ((cx - neck / 2 - x) * (yy - neckBottom)) / (y + h - neckBottom)
      const right = (yy: number) => 2 * cx - left(yy)
      const parts: ApparatusPart[] = [{
        points: [{ x: cx - neck / 2 - 4, y }, { x: cx - neck / 2, y: y + 4 }, { x: cx - neck / 2, y: neckBottom }, { x, y: y + h }, { x: x + w, y: y + h }, { x: cx + neck / 2, y: neckBottom }, { x: cx + neck / 2, y: y + 4 }, { x: cx + neck / 2 + 4, y }],
        closed: false, role: "body",
      }]
      if (fill > 0) {
        const level = y + h - (y + h - neckBottom) * fill
        parts.push({ points: [{ x: left(level) + inset, y: level }, { x: right(level) - inset, y: level }, { x: x + w - inset * 2, y: y + h - inset }, { x: x + inset * 2, y: y + h - inset }], closed: true, role: "liquid" })
      }
      return parts
    }
    case "round_bottom_flask": {
      const neck = w * 0.3
      const r = w / 2
      const cx = x + r
      const cy = y + h - r
      const join = cy - Math.sqrt(r * r - (neck / 2) ** 2)
      // From the neck's left side round the bottom to its right side: angles from upper-left (~3π/2) down through π/2.
      const aL = Math.atan2(join - cy, -neck / 2) + TAU
      const aR = Math.atan2(join - cy, neck / 2)
      const parts: ApparatusPart[] = [{
        points: [{ x: cx - neck / 2 - 4, y }, { x: cx - neck / 2, y: y + 4 }, ...arc(cx, cy, r, r, aL, aR, 48), { x: cx + neck / 2, y: y + 4 }, { x: cx + neck / 2 + 4, y }],
        closed: false, role: "body",
      }]
      if (fill > 0) {
        const ri = r - inset
        const level = Math.max(join + inset, cy + ri - 2 * ri * fill)
        const half = Math.sqrt(Math.max(0, ri * ri - (level - cy) ** 2))
        let a0 = Math.atan2(level - cy, -half)
        if (a0 < Math.PI / 2) a0 += TAU
        const a1 = Math.atan2(level - cy, half)
        parts.push({ points: arc(cx, cy, ri, ri, a0, a1, 36), closed: true, role: "liquid" })
      }
      return parts
    }
    case "test_tube":
    case "boiling_tube":
      return roundBottomTube(x, y, w, h, fill)
    case "measuring_cylinder": {
      // A tall narrow tube with a spout, standing on a wide base plate; dense graduations.
      const tube = w * 0.5
      const tx = x + (w - tube) / 2
      const baseH = h * 0.045
      const bottom = y + h - baseH
      const parts: ApparatusPart[] = [
        { points: [{ x: tx - tube * 0.15, y }, { x: tx, y: y + h * 0.03 }, { x: tx, y: bottom }, { x: tx + tube, y: bottom }, { x: tx + tube, y: y + h * 0.03 }, { x: tx + tube + tube * 0.08, y }], closed: false, role: "body" },
        { points: [{ x, y: bottom }, { x: x + w, y: bottom }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true, role: "body" },
        ...graduations(tx, y + h * 0.1, bottom, 9, tube * 0.4, 1),
      ]
      if (fill > 0) parts.push(liquidBox(tx, tx + tube, bottom - (bottom - y - h * 0.05) * fill, bottom, inset))
      return parts
    }
    case "burette": {
      // Long graduated tube, a tap two-thirds of the way down, and a narrow jet.
      const tube = w * 0.55
      const tx = x + (w - tube) / 2
      const tapY = y + h * 0.82
      const cx = x + w / 2
      const parts: ApparatusPart[] = [
        { points: [{ x: tx, y }, { x: tx, y: tapY }, { x: cx - tube * 0.18, y: tapY + h * 0.03 }, { x: cx - tube * 0.1, y: y + h }], closed: false, role: "body" },
        { points: [{ x: tx + tube, y }, { x: tx + tube, y: tapY }, { x: cx + tube * 0.18, y: tapY + h * 0.03 }, { x: cx + tube * 0.1, y: y + h }], closed: false, role: "body" },
        // The tap: a short handle across the tube.
        { points: [{ x: x, y: tapY - h * 0.012 }, { x: x + w, y: tapY - h * 0.012 }, { x: x + w, y: tapY + h * 0.012 }, { x: x, y: tapY + h * 0.012 }], closed: true, role: "detail" },
        ...graduations(tx, y + h * 0.04, tapY - h * 0.04, 12, tube * 0.45, 1),
      ]
      if (fill > 0) parts.push(liquidBox(tx, tx + tube, tapY - (tapY - y) * fill, tapY, inset))
      return parts
    }
    case "thermometer": {
      // A thin tube with a rounded top and a bulb at the bottom; the red column rises to `fill`.
      const tube = w * 0.45
      const tx = x + (w - tube) / 2
      const r = w / 2
      const cx = x + r
      const cy = y + h - r
      const join = cy - Math.sqrt(r * r - (tube / 2) ** 2)
      const aL = Math.atan2(join - cy, -tube / 2) + TAU
      const aR = Math.atan2(join - cy, tube / 2)
      // Left wall, round the bulb, right wall, then the rounded cap back to the start.
      const parts: ApparatusPart[] = [{
        points: [
          { x: tx, y: y + tube / 2 }, { x: tx, y: join }, ...arc(cx, cy, r, r, aL, aR, 32), { x: tx + tube, y: join }, { x: tx + tube, y: y + tube / 2 },
          ...arc(cx, y + tube / 2, tube / 2, tube / 2, 0, -Math.PI, 10),
        ],
        closed: true, role: "body",
      }]
      const columnTop = Math.min(join, cy - (cy - y - tube) * Math.max(fill, 0.05))
      // The bulb and the column above it are the thermometer liquid (red unless another colour is asked for).
      parts.push({ points: arc(cx, cy, r * 0.7, r * 0.7, 0, TAU, 20), closed: true, role: "liquid" })
      parts.push({ points: [{ x: cx - tube * 0.18, y: columnTop }, { x: cx + tube * 0.18, y: columnTop }, { x: cx + tube * 0.18, y: cy }, { x: cx - tube * 0.18, y: cy }], closed: true, role: "liquid" })
      parts.push(...graduations(tx + tube, y + h * 0.1, join, 8, w * 0.35, 1))
      return parts
    }
    case "funnel": {
      // A cone from a wide rim down to a narrow stem.
      const stem = w * 0.12
      const cx = x + w / 2
      const coneBottom = y + h * 0.48
      return [
        { points: [{ x, y }, { x: cx - stem / 2, y: coneBottom }, { x: cx - stem / 2, y: y + h }], closed: false, role: "body" },
        { points: [{ x: x + w, y }, { x: cx + stem / 2, y: coneBottom }, { x: cx + stem / 2, y: y + h }], closed: false, role: "body" },
      ]
    }
    case "evaporating_basin": {
      // A shallow bowl (half ellipse) with a small spout on the left rim.
      const cx = x + w / 2
      const parts: ApparatusPart[] = [{
        points: [{ x: x - w * 0.04, y: y - h * 0.08 }, ...arc(cx, y, w / 2, h, Math.PI, 0, 36)],
        closed: false, role: "body",
      }]
      if (fill > 0) {
        const level = y + h - h * fill
        const half = (w / 2 - inset) * Math.sqrt(Math.max(0, 1 - ((level - y) / (h - inset)) ** 2))
        const a0 = Math.atan2((level - y) / (h - inset), -half / (w / 2 - inset))
        const a1 = Math.atan2((level - y) / (h - inset), half / (w / 2 - inset))
        parts.push({ points: arc(cx, y, w / 2 - inset, h - inset, a0, a1, 30), closed: true, role: "liquid" })
      }
      return parts
    }
    case "bunsen_burner": {
      // Wide base, a barrel with an air hole, a gas inlet at the side - and a flame when lit.
      const cx = x + w / 2
      const barrel = w * 0.24
      const baseTop = y + h * 0.88
      const flameH = options.lit ? h * 0.3 : 0
      const top = y + flameH
      const parts: ApparatusPart[] = [
        { points: [{ x: x + w * 0.08, y: baseTop }, { x: x + w * 0.92, y: baseTop }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true, role: "body" },
        { points: [{ x: cx - barrel / 2, y: top }, { x: cx + barrel / 2, y: top }, { x: cx + barrel / 2, y: baseTop }, { x: cx - barrel / 2, y: baseTop }], closed: true, role: "body" },
        { points: [{ x: cx - barrel * 0.22, y: baseTop - h * 0.16 }, { x: cx + barrel * 0.22, y: baseTop - h * 0.16 }, { x: cx + barrel * 0.22, y: baseTop - h * 0.1 }, { x: cx - barrel * 0.22, y: baseTop - h * 0.1 }], closed: true, role: "detail" },
        { points: [{ x: cx + barrel / 2, y: baseTop - h * 0.06 }, { x: x + w, y: baseTop - h * 0.06 }, { x: x + w, y: baseTop - h * 0.02 }, { x: cx + barrel / 2, y: baseTop - h * 0.02 }], closed: true, role: "detail" },
      ]
      if (options.lit) {
        // A teardrop flame rising from the barrel to a point at the top.
        const fw = barrel * 0.45
        parts.push({ points: [
          { x: cx - fw, y: top }, { x: cx - fw * 0.8, y: top - flameH * 0.35 }, { x: cx - fw * 0.35, y: top - flameH * 0.75 }, { x: cx, y },
          { x: cx + fw * 0.35, y: top - flameH * 0.75 }, { x: cx + fw * 0.8, y: top - flameH * 0.35 }, { x: cx + fw, y: top },
        ], closed: true, role: "flame" })
      }
      return parts
    }
    case "tripod_gauze": {
      // A gauze square on top (cross-hatched) and the two front legs splaying out.
      const gauzeH = h * 0.06
      const parts: ApparatusPart[] = [
        { points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + gauzeH }, { x, y: y + gauzeH }], closed: true, role: "body" },
        ...Array.from({ length: 7 }, (_, i) => ({ points: [{ x: x + (w * (i + 1)) / 8, y }, { x: x + (w * (i + 1)) / 8, y: y + gauzeH }], closed: false, role: "detail" as const })),
        { points: [{ x: x + w * 0.1, y: y + gauzeH }, { x: x, y: y + h }], closed: false, role: "body" },
        { points: [{ x: x + w * 0.9, y: y + gauzeH }, { x: x + w, y: y + h }], closed: false, role: "body" },
        // Front view: the third leg is behind, hidden by whatever stands under the tripod (usually a burner).
      ]
      return parts
    }
    case "clamp_stand": {
      // Heavy base, a vertical rod, and a clamp arm with jaws reaching right.
      const rodX = x + w * 0.15
      const rod = w * 0.05
      const armY = y + h * 0.35
      return [
        { points: [{ x, y: y + h * 0.95 }, { x: x + w, y: y + h * 0.95 }, { x: x + w, y: y + h }, { x, y: y + h }], closed: true, role: "body" },
        { points: [{ x: rodX, y }, { x: rodX + rod, y }, { x: rodX + rod, y: y + h * 0.95 }, { x: rodX, y: y + h * 0.95 }], closed: true, role: "body" },
        { points: [{ x: rodX - rod, y: armY - rod }, { x: rodX + rod * 2, y: armY - rod }, { x: rodX + rod * 2, y: armY + rod }, { x: rodX - rod, y: armY + rod }], closed: true, role: "detail" },
        { points: [{ x: rodX + rod * 2, y: armY }, { x: x + w * 0.85, y: armY }], closed: false, role: "body" },
        { points: [{ x: x + w * 0.85, y: armY - h * 0.04 }, { x: x + w, y: armY - h * 0.04 }], closed: false, role: "detail" },
        { points: [{ x: x + w * 0.85, y: armY + h * 0.04 }, { x: x + w, y: armY + h * 0.04 }], closed: false, role: "detail" },
        { points: [{ x: x + w * 0.85, y: armY - h * 0.04 }, { x: x + w * 0.85, y: armY + h * 0.04 }], closed: false, role: "detail" },
      ]
    }
  }
}

/** Where a piece goes to sit on top of another (centred, its base on the other's top), or stand inside it. */
export function placeApparatus(
  kind: ApparatusKind,
  height: number,
  target: { x: number; y: number; w: number; h: number },
  how: "on" | "inside"
): { x: number; y: number } {
  const w = height * APPARATUS_SHAPE[kind].widthRatio
  const x = target.x + (target.w - w) / 2
  return how === "on"
    ? { x, y: target.y - height }
    : { x, y: target.y + target.h - height - target.h * 0.06 }
}
