/**
 * Copying a figure out of the question photo instead of redrawing it: the
 * copy is the same image, cropped to the figure, so every line, angle and
 * label is exactly as printed. Named parts of the figure (located by the
 * model as boxes in the photo) become anchors on the copy, so forces,
 * strings and labels attach to the real figure.
 */

export interface Rect { x: number; y: number; w: number; h: number }
export interface Crop { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * The crop (0-1 of the source image file) that shows exactly `area` of an
 * image shape displayed at `shown` on the board - composed with any crop
 * that image shape already has.
 */
export function cropFor(area: Rect, shown: Rect, existing: Crop | null): Crop {
  const u0 = clamp01((area.x - shown.x) / shown.w)
  const v0 = clamp01((area.y - shown.y) / shown.h)
  const u1 = clamp01((area.x + area.w - shown.x) / shown.w)
  const v1 = clamp01((area.y + area.h - shown.y) / shown.h)
  const base = existing ?? { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } }
  const sx = base.bottomRight.x - base.topLeft.x
  const sy = base.bottomRight.y - base.topLeft.y
  return {
    topLeft: { x: base.topLeft.x + u0 * sx, y: base.topLeft.y + v0 * sy },
    bottomRight: { x: base.topLeft.x + u1 * sx, y: base.topLeft.y + v1 * sy },
  }
}

/** Where a part of the original (in board coordinates) appears on the copy placed at `copy`. */
export function partOnCopy(part: Rect, original: Rect, copy: Rect): Rect {
  const sx = copy.w / original.w
  const sy = copy.h / original.h
  return { x: copy.x + (part.x - original.x) * sx, y: copy.y + (part.y - original.y) * sy, w: part.w * sx, h: part.h * sy }
}

/** How big to show the copy: enlarged so it's easy to annotate, within sensible bounds, keeping its shape. */
export function copySize(original: Rect, width?: number): { w: number; h: number } {
  const w = width ?? Math.min(700, Math.max(360, original.w * 1.6))
  return { w, h: (w * original.h) / original.w }
}

/**
 * The tilted rectangle inside an axis-aligned box: a block drawn at `degrees`
 * (as on a slope) fills a W x H bounding box when w cos θ + h sin θ = W and
 * w sin θ + h cos θ = H. Solving gives the block's own size, so anchors and
 * forces sit on the block itself rather than on its bounding box. Null when
 * the box doesn't fit a tilted rectangle (e.g. 45°, or a loose box).
 */
export function tiltedRectIn(box: Rect, degrees: number): { centre: { x: number; y: number }; w: number; h: number } | null {
  const t = (Math.abs(degrees) * Math.PI) / 180
  const c = Math.cos(t)
  const s = Math.sin(t)
  const det = c * c - s * s
  if (Math.abs(det) < 0.15) return null
  const w = (box.w * c - box.h * s) / det
  const h = (box.h * c - box.w * s) / det
  if (!(w > 4 && h > 4)) return null
  return { centre: { x: box.x + box.w / 2, y: box.y + box.h / 2 }, w, h }
}

type ImageBox = [number, number, number, number]

/**
 * Makes sure a figure's box holds only the figure, not the question's text:
 * every full line of printed prose (4+ words spanning over a third of the
 * image, as read by OCR) that the box overlaps is cut away, from whichever
 * side loses the least of the box. Short labels inside the figure ("3 kg",
 * "30°") aren't prose and stay. Boxes are [ymin, xmin, ymax, xmax], 0-1000.
 */
export function trimProseFromFigure(
  box: readonly [number, number, number, number],
  ocr: { width: number; height: number; words: { x0: number; y0: number; x1: number; y1: number; line: number }[] }
): ImageBox {
  const lines = new Map<number, { x0: number; y0: number; x1: number; y1: number; count: number }>()
  for (const w of ocr.words) {
    const l = lines.get(w.line)
    const r = { x0: (w.x0 / ocr.width) * 1000, y0: (w.y0 / ocr.height) * 1000, x1: (w.x1 / ocr.width) * 1000, y1: (w.y1 / ocr.height) * 1000 }
    lines.set(w.line, l
      ? { x0: Math.min(l.x0, r.x0), y0: Math.min(l.y0, r.y0), x1: Math.max(l.x1, r.x1), y1: Math.max(l.y1, r.y1), count: l.count + 1 }
      : { ...r, count: 1 })
  }
  const prose = [...lines.values()].filter((l) => l.count >= 4 && l.x1 - l.x0 >= 333)
  let [top, left, bottom, right] = box
  const MIN = 40
  for (let pass = 0; pass < 3; pass++) {
    for (const line of prose) {
      const overlaps = line.x0 < right && line.x1 > left && line.y0 < bottom && line.y1 > top
      if (!overlaps) continue
      const cuts = [
        { top: line.y1 + 4 }, { bottom: line.y0 - 4 }, { left: line.x1 + 4 }, { right: line.x0 - 4 },
      ].map((cut) => {
        const t = cut.top ?? top, b = cut.bottom ?? bottom, l = cut.left ?? left, r = cut.right ?? right
        return { t, b, l, r, kept: (b - t) * (r - l) }
      }).filter((c) => c.b - c.t >= MIN && c.r - c.l >= MIN)
      if (cuts.length === 0) continue
      const best = cuts.reduce((a, c) => (c.kept > a.kept ? c : a))
      ;[top, bottom, left, right] = [best.t, best.b, best.l, best.r]
    }
  }
  return [top, left, bottom, right]
}

/**
 * Shrinks a figure's box to the ink inside it, with a small margin, so the
 * copy is the figure and not the blank paper around it. `ink` is a grid over
 * the whole image; boxes are [ymin, xmin, ymax, xmax] on 0-1000. If there is
 * no ink in the box (or no grid), the box is returned unchanged.
 */
export function tightenToInk(
  box: readonly [number, number, number, number],
  ink: { cols: number; rows: number; cells: ArrayLike<number> } | undefined,
  margin = 15
): ImageBox {
  const [top, left, bottom, right] = box
  if (!ink) return [top, left, bottom, right]
  const c0 = Math.max(0, Math.floor((left / 1000) * ink.cols)), c1 = Math.min(ink.cols - 1, Math.ceil((right / 1000) * ink.cols) - 1)
  const r0 = Math.max(0, Math.floor((top / 1000) * ink.rows)), r1 = Math.min(ink.rows - 1, Math.ceil((bottom / 1000) * ink.rows) - 1)
  let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!ink.cells[r * ink.cols + c]) continue
      minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r)
    }
  }
  if (minC === Infinity) return [top, left, bottom, right]
  return [
    Math.max(top, (minR / ink.rows) * 1000 - margin),
    Math.max(left, (minC / ink.cols) * 1000 - margin),
    Math.min(bottom, ((maxR + 1) / ink.rows) * 1000 + margin),
    Math.min(right, ((maxC + 1) / ink.cols) * 1000 + margin),
  ]
}

/** Overlap area of two rects (0 if they don't overlap). */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}
