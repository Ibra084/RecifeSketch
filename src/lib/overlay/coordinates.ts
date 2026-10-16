/**
 * The three coordinate systems the whiteboard overlay deals in, as
 * distinct types so they can't be mixed by accident:
 *
 *  - PagePoint / PageRect: whiteboard (tldraw page) space. Drawings live
 *    here; they move with the camera.
 *  - ViewportPoint / ViewportRect: CSS pixels relative to the whiteboard
 *    container's top-left. The AI companion orb and its speech bubble live
 *    here; they stay put on screen while the student pans and zooms.
 *
 * Note: tldraw's `pageToScreen` returns *window* coordinates (it adds the
 * container's offset on the page). Overlays rendered inside the container
 * must use `pageToViewport` instead - mixing the two shifts everything by
 * the height of whatever sits above the canvas.
 */

declare const space: unique symbol

export type PagePoint = { readonly x: number; readonly y: number; readonly [space]: "page" }
export type PageRect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly [space]: "page" }
export type ViewportPoint = { readonly x: number; readonly y: number; readonly [space]: "viewport" }
export type ViewportRect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly [space]: "viewport" }
export interface ViewportSize { readonly w: number; readonly h: number }

export const pagePoint = (x: number, y: number) => ({ x, y }) as PagePoint
export const pageRect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h }) as PageRect
export const viewportPoint = (x: number, y: number) => ({ x, y }) as ViewportPoint
export const viewportRect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h }) as ViewportRect

/** The one camera transform the overlay needs - satisfied by a tldraw Editor. */
export interface ViewportProjector {
  pageToViewport(point: { x: number; y: number }): { x: number; y: number }
}

export function projectPoint(editor: ViewportProjector, point: PagePoint): ViewportPoint {
  const p = editor.pageToViewport(point)
  return viewportPoint(p.x, p.y)
}

export function projectRect(editor: ViewportProjector, rect: PageRect): ViewportRect {
  const a = editor.pageToViewport({ x: rect.x, y: rect.y })
  const b = editor.pageToViewport({ x: rect.x + rect.w, y: rect.y + rect.h })
  return viewportRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
}

export function rectCenter(rect: ViewportRect): ViewportPoint {
  return viewportPoint(rect.x + rect.w / 2, rect.y + rect.h / 2)
}
