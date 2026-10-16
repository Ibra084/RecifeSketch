import type { DrawingAction, Point } from "./protocol"

function centroid(points: readonly Point[]): Point {
  const x = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const y = points.reduce((sum, p) => sum + p.y, 0) / points.length
  return { x, y }
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * Where, in page space, an action is visually "about" - used to move a
 * pointer indicator to roughly the right place while the AI draws, so a
 * student can see where to look instead of only reading chat text. This
 * is a rough visual aid, not a precise bounding box: close enough to
 * follow along is the goal, not pixel accuracy.
 *
 * Returns null for actions with no inherent coordinates of their own
 * (anything that only references an existing object by id, or a camera
 * move) - the caller can look up a live object's bounds for those.
 */
export function actionFocusPoint(action: DrawingAction): Point | null {
  switch (action.type) {
    case "create_shape":
      return { x: action.x + action.w / 2, y: action.y + action.h / 2 }
    case "create_freehand_path":
    case "create_polygon":
    case "draw_line":
      return centroid(action.points)
    case "draw_arrow":
      return midpoint(action.start, action.end)
    case "draw_curve":
      return action.start
    case "draw_repeated_curve":
      return midpoint(action.start, action.end)
    case "write_text":
    case "write_equation":
      return action.position
    case "draw_apparatus":
      return action.position ?? null
    case "draw_incline":
      return action.position
    case "draw_pulley":
      return action.centre ?? null
    case "copy_figure":
      return action.position
    case "draw_on_incline":
      return null
    case "draw_graph":
      return { x: action.position.x + (action.w ?? 520) / 2, y: action.position.y + (action.h ?? 380) / 2 }
    case "plot_function":
      return action.position ?? { x: 0, y: 0 }
    case "clear_region":
      return { x: action.region.x + action.region.w / 2, y: action.region.y + action.region.h / 2 }
    case "draw_force": // placed relative to its object, which may not exist yet
    case "update_graph":
    case "mark_image": // positioned relative to the image the model saw
    case "highlight_text":
    case "draw_mass":
    case "draw_string":
    case "move_object":
    case "update_object":
    case "update_plot":
    case "delete_object":
    case "highlight_object":
    case "focus_camera":
      return null
  }
}

function boundingBox(points: readonly Point[]): { x: number; y: number; w: number; h: number } {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/**
 * The page-space area an action will cover, from its own declared geometry -
 * available before the shape exists, so an overlay placed at step start can
 * avoid the whole drawing rather than just its center. Unknown extents
 * (text, equations) fall back to a 1x1 rect at the focus point.
 */
export function actionFocusRect(action: DrawingAction): { x: number; y: number; w: number; h: number } | null {
  switch (action.type) {
    case "create_shape":
      return { x: action.x, y: action.y, w: action.w, h: action.h }
    case "create_freehand_path":
    case "create_polygon":
    case "draw_line":
      return boundingBox(action.points)
    case "draw_arrow":
    case "draw_repeated_curve":
      return boundingBox([action.start, action.end])
    case "clear_region":
      return action.region
    case "draw_graph":
      return { x: action.position.x, y: action.position.y, w: action.w ?? 520, h: action.h ?? 380 }
    default: {
      const point = actionFocusPoint(action)
      return point ? { x: point.x, y: point.y, w: 1, h: 1 } : null
    }
  }
}
