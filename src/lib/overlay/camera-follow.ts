/**
 * Where the camera should go so the student watches the tutor write: the
 * screen follows whatever is being drawn right now.
 *
 * - Zoomed too far out to read it: zoom in on it (to at most 100%).
 * - Drifting away from the middle of the screen: re-centre on it.
 * - Already near the middle and readable: stay still, so small labels
 *   written one after another don't make the camera jitter.
 * - Bigger than the screen: zoom out just enough to fit it.
 *
 * All rects are in page space; `margin` is page units of breathing room kept
 * around the target, and `zoom` is the current zoom level (1 = 100%).
 */

export interface Rect { x: number; y: number; w: number; h: number }

export type CameraMove =
  | { kind: "none" }
  | { kind: "pan"; center: { x: number; y: number } }
  | { kind: "fit"; bounds: Rect }

/** Below this zoom, tutor writing is too small to read comfortably. */
export const READABLE_ZOOM = 0.75
/** The writing should stay within the middle of the screen (this fraction is kept clear at each edge). */
const EDGE_FRACTION = 0.2

export function cameraMoveFor(view: Rect, target: Rect, margin: number, zoom = 1): CameraMove {
  const padded = { x: target.x - margin, y: target.y - margin, w: target.w + 2 * margin, h: target.h + 2 * margin }
  const centre = { x: target.x + target.w / 2, y: target.y + target.h / 2 }

  // The page area the screen shows at a readable zoom: whatever fits in it is worth zooming in on.
  const readableW = (view.w * zoom) / READABLE_ZOOM
  const readableH = (view.h * zoom) / READABLE_ZOOM
  if (zoom < READABLE_ZOOM && padded.w <= readableW && padded.h <= readableH) return { kind: "fit", bounds: padded }

  if (padded.w > view.w || padded.h > view.h) return { kind: "fit", bounds: padded }

  const inside = padded.x >= view.x && padded.y >= view.y &&
    padded.x + padded.w <= view.x + view.w && padded.y + padded.h <= view.y + view.h
  const nearMiddle =
    centre.x >= view.x + view.w * EDGE_FRACTION && centre.x <= view.x + view.w * (1 - EDGE_FRACTION) &&
    centre.y >= view.y + view.h * EDGE_FRACTION && centre.y <= view.y + view.h * (1 - EDGE_FRACTION)
  if (inside && nearMiddle) return { kind: "none" }
  return { kind: "pan", center: centre }
}
