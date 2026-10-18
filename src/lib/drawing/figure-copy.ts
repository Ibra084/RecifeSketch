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

/** A copy is never shown bigger than this many times its real pixels in the photo - beyond that it's just blur. */
const MAX_UPSCALE = 2

/**
 * How big to show the copy: enlarged so it's easy to annotate, within
 * sensible bounds, keeping its shape - but never more than twice the figure's
 * real pixel width (`nativeWidth`), so a small photo isn't blown up into a blur.
 */
export function copySize(original: Rect, width?: number, nativeWidth?: number): { w: number; h: number } {
  let w = width ?? Math.min(700, Math.max(360, original.w * 1.6))
  if (nativeWidth !== undefined && nativeWidth > 0) w = Math.min(w, nativeWidth * MAX_UPSCALE)
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
type BoxIn = readonly [number, number, number, number]
type OcrWords = { width: number; height: number; words: { x0: number; y0: number; x1: number; y1: number; line: number }[] }
type InkGrid = { cols: number; rows: number; cells: ArrayLike<number> }

const boxArea = (b: BoxIn) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
function unionOf(boxes: readonly BoxIn[]): ImageBox | undefined {
  if (boxes.length === 0) return undefined
  return [
    Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3])),
  ]
}

/**
 * The crop for a copied figure (boxes are [ymin, xmin, ymax, xmax], 0-1000).
 * Starts from the model's box, trims the question's sentences off it and
 * tightens it to the ink - but the figure's named parts are always kept whole
 * (the copy is grown to include any part the model boxed outside it), and a
 * trim that would throw away most of the figure is abandoned. Without those
 * guards, a diagram printed beside its text was cut to a sliver, and the parts
 * mapped onto that sliver came out many times their real size.
 */
export function figureCrop(box: BoxIn, parts: readonly BoxIn[], ocr?: OcrWords & { ink?: InkGrid }): ImageBox {
  const protect = unionOf(parts)
  let crop: ImageBox = [box[0], box[1], box[2], box[3]]
  if (ocr) {
    const trimmed = trimProseFromFigure(box, ocr, protect)
    // A real figure is never mostly sentences: if trimming took most of it, the trim was wrong.
    crop = boxArea(trimmed) >= 0.5 * boxArea(box) ? trimmed : crop
    crop = tightenToInk(crop, ocr.ink)
    if (ocr.ink) crop = extendPastInk(crop, ocr.ink, proseLines(ocr))
  }
  return protect ? unionOf([crop, protect])! : crop
}

/** The question's sentences (OCR lines of 4+ words spanning a third of the image), as [ymin, xmin, ymax, xmax] on 0-1000. */
function proseLines(ocr: OcrWords): ImageBox[] {
  const lines = new Map<number, ImageBox>()
  const counts = new Map<number, number>()
  for (const w of ocr.words) {
    const r: ImageBox = [(w.y0 / ocr.height) * 1000, (w.x0 / ocr.width) * 1000, (w.y1 / ocr.height) * 1000, (w.x1 / ocr.width) * 1000]
    const l = lines.get(w.line)
    lines.set(w.line, l ? [Math.min(l[0], r[0]), Math.min(l[1], r[1]), Math.max(l[2], r[2]), Math.max(l[3], r[3])] : r)
    counts.set(w.line, (counts.get(w.line) ?? 0) + 1)
  }
  return [...lines.entries()].filter(([line, b]) => (counts.get(line) ?? 0) >= 4 && b[3] - b[1] >= 333).map(([, b]) => b)
}

/**
 * Never cuts a drawn object in half: while a line of ink continues across an
 * edge of the crop (a mass's outline, a string, a slope), that edge moves
 * outward, until it reaches blank paper. Bounded (half the crop's size per
 * side) and never into the question's sentences, so it can't run away across
 * the page. Boxes are [ymin, xmin, ymax, xmax] on 0-1000.
 */
export function extendPastInk(box: BoxIn, ink: InkGrid, prose: readonly BoxIn[] = [], margin = 10): ImageBox {
  const cw = 1000 / ink.cols, ch = 1000 / ink.rows
  const inProse = (r: number, c: number) => {
    const y = (r + 0.5) * ch, x = (c + 0.5) * cw
    return prose.some((p) => y >= p[0] && y <= p[2] && x >= p[1] && x <= p[3])
  }
  const at = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < ink.rows && c < ink.cols && Boolean(ink.cells[r * ink.cols + c]) && !inProse(r, c)
  let r0 = Math.max(0, Math.floor(box[0] / ch)), c0 = Math.max(0, Math.floor(box[1] / cw))
  let r1 = Math.min(ink.rows - 1, Math.ceil(box[2] / ch) - 1), c1 = Math.min(ink.cols - 1, Math.ceil(box[3] / cw) - 1)
  const growR = Math.ceil((r1 - r0 + 1) * 0.5), growC = Math.ceil((c1 - c0 + 1) * 0.5)
  /** Ink on the edge row/column that carries on into the next one out (allowing a one-cell diagonal step). */
  const rowContinues = (edge: number, next: number) => {
    for (let c = c0; c <= c1; c++) if (at(edge, c) && (at(next, c - 1) || at(next, c) || at(next, c + 1))) return true
    return false
  }
  const colContinues = (edge: number, next: number) => {
    for (let r = r0; r <= r1; r++) if (at(r, edge) && (at(r - 1, next) || at(r, next) || at(r + 1, next))) return true
    return false
  }
  const moved = { top: false, bottom: false, left: false, right: false }
  for (let n = 0; n < growR && r1 + 1 < ink.rows && rowContinues(r1, r1 + 1); n++) { r1++; moved.bottom = true }
  for (let n = 0; n < growR && r0 > 0 && rowContinues(r0, r0 - 1); n++) { r0--; moved.top = true }
  for (let n = 0; n < growC && c1 + 1 < ink.cols && colContinues(c1, c1 + 1); n++) { c1++; moved.right = true }
  for (let n = 0; n < growC && c0 > 0 && colContinues(c0, c0 - 1); n++) { c0--; moved.left = true }
  // Edges that moved get a little breathing room; the others keep exactly what they had.
  return [
    moved.top ? Math.max(0, r0 * ch - margin) : box[0],
    moved.left ? Math.max(0, c0 * cw - margin) : box[1],
    moved.bottom ? Math.min(1000, (r1 + 1) * ch + margin) : box[2],
    moved.right ? Math.min(1000, (c1 + 1) * cw + margin) : box[3],
  ]
}

/**
 * Snaps a part's box onto the figure's drawn outline: each edge moves to the
 * nearby row/column of the ink grid that is drawn along most of the box's
 * span (the block's own edge), so anchors and forces sit exactly on the drawn
 * block rather than on the model's estimate. Edges with no such line nearby
 * (a curved or tilted part, a label) stay where they were.
 */
export function snapBoxToInk(box: BoxIn, ink: InkGrid | undefined): ImageBox {
  const [top, left, bottom, right] = box
  if (!ink) return [top, left, bottom, right]
  const cw = 1000 / ink.cols, ch = 1000 / ink.rows
  const clampC = (c: number) => Math.min(ink.cols - 1, Math.max(0, c))
  const clampR = (r: number) => Math.min(ink.rows - 1, Math.max(0, r))
  const c0 = clampC(Math.floor(left / cw)), c1 = clampC(Math.ceil(right / cw) - 1)
  const r0 = clampR(Math.floor(top / ch)), r1 = clampR(Math.ceil(bottom / ch) - 1)
  const at = (r: number, c: number) => ink.cells[r * ink.cols + c] ? 1 : 0
  const rowCover = (r: number) => { let n = 0; for (let c = c0; c <= c1; c++) n += at(r, c); return n / (c1 - c0 + 1) }
  const colCover = (c: number) => { let n = 0; for (let r = r0; r <= r1; r++) n += at(r, c); return n / (r1 - r0 + 1) }
  const THRESHOLD = 0.5
  /** The best-covered line within reach of `from` (ties go to the nearest), or undefined if none is drawn along the span. */
  const best = (from: number, reach: number, lo: number, hi: number, cover: (i: number) => number) => {
    let pick: number | undefined, pickCover = 0
    for (let i = Math.max(lo, from - reach); i <= Math.min(hi, from + reach); i++) {
      const v = cover(i)
      if (v < THRESHOLD) continue
      const better = pick === undefined || v > pickCover || (v === pickCover && Math.abs(i - from) < Math.abs(pick - from))
      if (better) { pick = i; pickCover = v }
    }
    return pick
  }
  const reachR = Math.max(2, Math.round((r1 - r0 + 1) * 0.3)), reachC = Math.max(2, Math.round((c1 - c0 + 1) * 0.3))
  const mid = { r: Math.floor((r0 + r1) / 2), c: Math.floor((c0 + c1) / 2) }
  const t = best(r0, reachR, 0, mid.r, rowCover)
  const b = best(r1, reachR, mid.r + 1, ink.rows - 1, rowCover)
  const l = best(c0, reachC, 0, mid.c, colCover)
  const rr = best(c1, reachC, mid.c + 1, ink.cols - 1, colCover)
  return [
    t !== undefined ? t * ch : top,
    l !== undefined ? l * cw : left,
    b !== undefined ? (b + 1) * ch : bottom,
    rr !== undefined ? (rr + 1) * cw : right,
  ]
}

/**
 * Makes sure a figure's box holds only the figure, not the question's text:
 * every full line of printed prose (4+ words spanning over a third of the
 * image, as read by OCR) that the box overlaps is cut away, from whichever
 * side loses the least of the box. Short labels inside the figure ("3 kg",
 * "30°") aren't prose and stay. Boxes are [ymin, xmin, ymax, xmax], 0-1000.
 */
export function trimProseFromFigure(
  box: readonly [number, number, number, number],
  ocr: OcrWords,
  /** Area that must survive the trim (the figure's named parts): lines touching it aren't prose, and no cut may enter it. */
  protect?: ImageBox
): ImageBox {
  const lines = new Map<number, { x0: number; y0: number; x1: number; y1: number; count: number }>()
  for (const w of ocr.words) {
    const l = lines.get(w.line)
    const r = { x0: (w.x0 / ocr.width) * 1000, y0: (w.y0 / ocr.height) * 1000, x1: (w.x1 / ocr.width) * 1000, y1: (w.y1 / ocr.height) * 1000 }
    lines.set(w.line, l
      ? { x0: Math.min(l.x0, r.x0), y0: Math.min(l.y0, r.y0), x1: Math.max(l.x1, r.x1), y1: Math.max(l.y1, r.y1), count: l.count + 1 }
      : { ...r, count: 1 })
  }
  const touchesProtected = (l: { x0: number; y0: number; x1: number; y1: number }) =>
    Boolean(protect) && l.x0 < protect![3] && l.x1 > protect![1] && l.y0 < protect![2] && l.y1 > protect![0]
  const prose = [...lines.values()].filter((l) => l.count >= 4 && l.x1 - l.x0 >= 333 && !touchesProtected(l))
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
        .filter((c) => !protect || (c.t <= protect[0] && c.l <= protect[1] && c.b >= protect[2] && c.r >= protect[3]))
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

/** A box grown by `fraction` of its size on every side, kept within the image. Boxes are [ymin, xmin, ymax, xmax], 0-1000. */
export function expandBox(box: BoxIn, fraction: number): ImageBox {
  const dy = (box[2] - box[0]) * fraction, dx = (box[3] - box[1]) * fraction
  return [Math.max(0, box[0] - dy), Math.max(0, box[1] - dx), Math.min(1000, box[2] + dy), Math.min(1000, box[3] + dx)]
}

/** A box in the whole image, expressed in a crop of it (both 0-1000 of their own image). */
export function toCropSpace(box: BoxIn, crop: BoxIn): ImageBox {
  const h = crop[2] - crop[0], w = crop[3] - crop[1]
  const y = (v: number) => Math.min(1000, Math.max(0, ((v - crop[0]) / h) * 1000))
  const x = (v: number) => Math.min(1000, Math.max(0, ((v - crop[1]) / w) * 1000))
  return [y(box[0]), x(box[1]), y(box[2]), x(box[3])]
}

/** A box found in a crop, expressed back in the whole image. */
export function fromCropSpace(box: BoxIn, crop: BoxIn): ImageBox {
  const h = crop[2] - crop[0], w = crop[3] - crop[1]
  return [crop[0] + (box[0] / 1000) * h, crop[1] + (box[1] / 1000) * w, crop[0] + (box[2] / 1000) * h, crop[1] + (box[3] / 1000) * w]
}

/** Overlap area of two rects (0 if they don't overlap). */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}
