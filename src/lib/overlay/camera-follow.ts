/**
 * Where the camera should go so the student sees what the tutor is drawing
 * right now. Moves as little as possible: nothing if it's already in view,
 * a minimal pan if it fits on screen, and a zoom-to-fit only if it's bigger
 * than the screen. All rects are in page space; `margin` is page units of
 * breathing room kept around the target.
 */

export interface Rect { x: number; y: number; w: number; h: number }

export type CameraMove =
  | { kind: "none" }
  | { kind: "pan"; center: { x: number; y: number } }
  | { kind: "fit"; bounds: Rect }

export function cameraMoveFor(view: Rect, target: Rect, margin: number): CameraMove {
  const padded = { x: target.x - margin, y: target.y - margin, w: target.w + 2 * margin, h: target.h + 2 * margin }
  const inside = padded.x >= view.x && padded.y >= view.y &&
    padded.x + padded.w <= view.x + view.w && padded.y + padded.h <= view.y + view.h
  if (inside) return { kind: "none" }
  if (padded.w > view.w || padded.h > view.h) return { kind: "fit", bounds: padded }
  // Shift just far enough that the padded target's nearest edge comes into view.
  const shift = (start: number, size: number, viewStart: number, viewSize: number) =>
    start < viewStart ? start - viewStart : start + size > viewStart + viewSize ? start + size - (viewStart + viewSize) : 0
  const dx = shift(padded.x, padded.w, view.x, view.w)
  const dy = shift(padded.y, padded.h, view.y, view.h)
  return { kind: "pan", center: { x: view.x + view.w / 2 + dx, y: view.y + view.h / 2 + dy } }
}
