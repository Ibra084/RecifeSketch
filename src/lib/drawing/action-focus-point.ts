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
    case "plot_function":
      return action.position ?? { x: 0, y: 0 }
    case "clear_region":
      return { x: action.region.x + action.region.w / 2, y: action.region.y + action.region.h / 2 }
    case "move_object":
    case "update_object":
    case "update_plot":
    case "delete_object":
    case "highlight_object":
    case "focus_camera":
      return null
  }
}
