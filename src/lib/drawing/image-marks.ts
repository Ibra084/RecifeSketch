/**
 * Maps a mark the model placed on the image it was shown - a box in
 * Gemini's native [ymin, xmin, ymax, xmax] format on a 0-1000 scale - onto
 * the exact board rectangle that image occupies, and sizes the outline so
 * it hugs the target: a box with a hair of padding, an ellipse that fully
 * encloses the box's corners, or an underline just below it.
 */

export interface PageRect { x: number; y: number; w: number; h: number }

export function imageBoxToPage(box: readonly [number, number, number, number], region: PageRect): PageRect {
  const [ymin, xmin, ymax, xmax] = box
  return {
    x: region.x + (xmin / 1000) * region.w,
    y: region.y + (ymin / 1000) * region.h,
    w: ((xmax - xmin) / 1000) * region.w,
    h: ((ymax - ymin) / 1000) * region.h,
  }
}

/** A box outline: tight, with just enough padding that the stroke doesn't cross the target. */
export function boxOutline(target: PageRect): PageRect {
  const pad = 4
  return { x: target.x - pad, y: target.y - pad, w: target.w + 2 * pad, h: target.h + 2 * pad }
}

/** An ellipse through the box's corners (an inscribed one would cut them off): each axis is √2 × the box, centred. */
export function circleOutline(target: PageRect): PageRect {
  const w = target.w * Math.SQRT2 + 6
  const h = target.h * Math.SQRT2 + 6
  return { x: target.x + target.w / 2 - w / 2, y: target.y + target.h / 2 - h / 2, w, h }
}

/** An underline: the box's width, a few units below its bottom edge. */
export function underlineFor(target: PageRect): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const y = target.y + target.h + 3
  return { start: { x: target.x, y }, end: { x: target.x + target.w, y } }
}
