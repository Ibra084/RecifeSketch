/**
 * Places a new lesson in clear space, so it never draws over what's already
 * on the board (earlier answers, the question, the student's work).
 *
 * The model chooses coordinates, but it can't see exactly what's there - and
 * when a student asks about the same thing twice it is told to answer "right
 * beside" the same target both times. So before a lesson plays, its body (new
 * diagrams, graphs, figures, working) is estimated as one block and, if that
 * block would land on anything, the whole lesson is slid to the nearest clear
 * spot around where it was planned - in any direction - keeping its own
 * internal layout.
 *
 * What stays put: marks meant to sit ON the student's own work, the question,
 * or what they selected (an outline or underline over it, a short label next
 * to it); an arrow keeps its end on that content and only its tail moves.
 * Everything placed relative to the question image (mark_image,
 * highlight_text) or to other objects (forces, strings) is untouched.
 */

import type { DrawingAction, Point } from "./protocol"

export interface Rect { x: number; y: number; w: number; h: number }

/** Something already on the board. `annotatable`: the student's own work, the question, or something selected. */
export interface Obstacle extends Rect { annotatable: boolean }

type Step = { actions: DrawingAction[]; pauseAfterMs?: number }

const MARGIN = 40
const SEARCH_STEP = 40
const SEARCH_RADIUS = 4000
/** How close an arrow's end must be to content to count as pointing at it. */
const ANCHOR_REACH = 24
/** How close a short label must be to content to count as labelling it. */
const LABEL_REACH = 60
/** The notes column the adapter lays a lesson's writing into, beside its drawings. */
const NOTES_GAP = 48
const NOTES_WIDTH = 460

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
const grow = (r: Rect, by: number): Rect => ({ x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by })
const near = (p: Point, r: Rect, by: number) => p.x >= r.x - by && p.x <= r.x + r.w + by && p.y >= r.y - by && p.y <= r.y + r.h + by

function boundsOf(points: readonly Point[]): Rect {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(1, Math.max(...xs) - x), h: Math.max(1, Math.max(...ys) - y) }
}

function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y))
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y }
}

const isShortLabel = (text: string) => !text.includes("\n") && text.trim().split(/\s+/).length <= 3 && text.length <= 28

/** Rough size of a piece of writing, in page units (typeset at the default size). */
function textSize(text: string, kind: "text" | "equation"): { w: number; h: number } {
  if (kind === "equation") return { w: Math.min(640, 24 + text.length * 11), h: 48 }
  const lines = text.split("\n")
  const longest = Math.max(...lines.map((l) => l.length))
  const w = Math.min(NOTES_WIDTH, 20 + longest * 8.5)
  const wrapped = lines.reduce((n, l) => n + Math.max(1, Math.ceil((l.length * 8.5) / NOTES_WIDTH)), 0)
  return { w, h: 12 + wrapped * 26 }
}

/** Is this action a mark meant to sit on existing content (so it must not move)? */
function isAnnotation(action: DrawingAction, annotatable: readonly Obstacle[]): boolean {
  switch (action.type) {
    case "create_shape":
      return (action.fill ?? "none") === "none" && annotatable.some((o) => intersects({ x: action.x, y: action.y, w: action.w, h: action.h }, o))
    case "draw_line":
    case "create_freehand_path":
      return annotatable.some((o) => intersects(grow(boundsOf(action.points), 4), o))
    case "create_polygon":
      return (action.fill ?? "none") === "none" && annotatable.some((o) => intersects(boundsOf(action.points), o))
    case "write_text":
      return isShortLabel(action.text) && annotatable.some((o) => near(action.position, o, LABEL_REACH))
    default:
      return false
  }
}

/** The area an action's new content will cover (null: not part of the lesson's body). */
function bodyRect(action: DrawingAction): Rect | null {
  switch (action.type) {
    case "create_shape": return { x: action.x, y: action.y, w: action.w, h: action.h }
    case "create_freehand_path":
    case "create_polygon":
    case "draw_line": return boundsOf(action.points)
    case "draw_arrow": return boundsOf([action.start, action.end])
    case "draw_curve": return boundsOf([action.start, ...action.segments.flatMap((s) => [s.c1, s.c2, s.end])])
    case "draw_repeated_curve": return grow(boundsOf([action.start, action.end]), action.amplitude)
    case "draw_incline": {
      const base = action.base ?? 400
      return { x: action.position.x, y: action.position.y, w: base, h: base * Math.tan((Math.min(action.angle, 70) * Math.PI) / 180) }
    }
    case "copy_figure": {
      const w = action.width ?? 500
      return { x: action.position.x, y: action.position.y, w, h: w * 0.75 }
    }
    case "draw_pulley": return action.centre ? { x: action.centre.x - 60, y: action.centre.y - 120, w: 120, h: 170 } : null
    case "draw_mass": return action.position ? { x: action.position.x, y: action.position.y, w: action.size ?? 60, h: action.size ?? 60 } : null
    case "draw_apparatus": {
      if (!action.position) return null
      const h = action.height ?? 200
      return { x: action.position.x, y: action.position.y, w: h * 0.7, h }
    }
    case "draw_graph": return { x: action.position.x, y: action.position.y, w: action.w ?? 500, h: action.h ?? 400 }
    case "plot_function": {
      const at = action.position ?? { x: 0, y: 0 }
      const w = (action.domain[1] - action.domain[0]) * (action.scale?.x ?? 40)
      return { x: at.x, y: at.y - w * 0.3, w, h: w * 0.6 }
    }
    case "write_text": return { ...action.position, ...textSize(action.text, "text") }
    case "write_equation": return { ...action.position, ...textSize(action.expression, "equation") }
    default: return null
  }
}

const shiftPoint = (p: Point, dx: number, dy: number): Point => ({ x: p.x + dx, y: p.y + dy })

/** The action moved by (dx, dy). Anything not drawn at its own coordinates comes back unchanged. */
export function shiftAction(action: DrawingAction, dx: number, dy: number, anchors: readonly Rect[] = []): DrawingAction {
  const p = (pt: Point) => shiftPoint(pt, dx, dy)
  switch (action.type) {
    case "create_shape": return { ...action, x: action.x + dx, y: action.y + dy }
    case "create_freehand_path":
    case "create_polygon":
    case "draw_line": return { ...action, points: action.points.map(p) } as DrawingAction
    case "draw_arrow": {
      // An end pointing at existing content stays on it; only the free end moves with the lesson.
      const pinned = (pt: Point) => anchors.some((a) => near(pt, a, ANCHOR_REACH))
      return { ...action, start: pinned(action.start) ? action.start : p(action.start), end: pinned(action.end) ? action.end : p(action.end) }
    }
    case "draw_curve": return { ...action, start: p(action.start), segments: action.segments.map((s) => ({ c1: p(s.c1), c2: p(s.c2), end: p(s.end) })) }
    case "draw_repeated_curve": return { ...action, start: p(action.start), end: p(action.end) }
    case "draw_incline":
    case "copy_figure":
    case "draw_graph":
    case "write_text":
    case "write_equation": return { ...action, position: p(action.position) }
    case "draw_pulley": return action.centre ? { ...action, centre: p(action.centre) } : action
    case "draw_mass":
    case "draw_apparatus": return action.position ? { ...action, position: p(action.position) } : action
    case "plot_function": return { ...action, position: p(action.position ?? { x: 0, y: 0 }) }
    case "focus_camera":
      return action.target.kind === "bounds"
        ? { ...action, target: { ...action.target, region: { ...action.target.region, x: action.target.region.x + dx, y: action.target.region.y + dy } } }
        : action.target.kind === "point" ? { ...action, target: { ...action.target, position: p(action.target.position) } } : action
    default: return action
  }
}

/** The nearest (dx, dy) that puts `block` clear of every obstacle, or null if there's none within reach. */
export function nearestClearOffset(block: Rect, obstacles: readonly Rect[]): { dx: number; dy: number } | null {
  const padded = grow(block, MARGIN)
  const clear = (dx: number, dy: number) => {
    const moved = { x: padded.x + dx, y: padded.y + dy, w: padded.w, h: padded.h }
    return !obstacles.some((o) => intersects(moved, o))
  }
  if (clear(0, 0)) return { dx: 0, dy: 0 }
  // Search outwards ring by ring, so the first clear spot found is (about) the nearest.
  for (let r = SEARCH_STEP; r <= SEARCH_RADIUS; r += SEARCH_STEP) {
    let best: { dx: number; dy: number; d: number } | null = null
    for (let dx = -r; dx <= r; dx += SEARCH_STEP) {
      for (const dy of Math.abs(dx) === r ? rangeOf(r) : [-r, r]) {
        if (!clear(dx, dy)) continue
        const d = Math.hypot(dx, dy)
        if (!best || d < best.d) best = { dx, dy, d }
      }
    }
    if (best) return { dx: best.dx, dy: best.dy }
  }
  return null
}

function rangeOf(r: number): number[] {
  const out: number[] = []
  for (let v = -r; v <= r; v += SEARCH_STEP) out.push(v)
  return out
}

export interface PlacedLesson<S extends Step> {
  steps: S[]
  /** How far the lesson's body was moved (0, 0 when it already fitted). */
  dx: number
  dy: number
}

/**
 * Moves a lesson's body to clear space if it would overlap what's on the
 * board. `obstacles` are the board's current contents, minus anything the
 * lesson itself deletes.
 */
export function placeLesson<S extends Step>(steps: S[], obstacles: readonly Obstacle[]): PlacedLesson<S> {
  const annotatable = obstacles.filter((o) => o.annotatable)
  const actions = steps.flatMap((s) => s.actions)
  const annotations = new Set(actions.filter((a) => isAnnotation(a, annotatable)))

  const rects: Rect[] = []
  let notesHeight = 0
  for (const action of actions) {
    if (annotations.has(action)) continue
    if (action.type === "draw_arrow") {
      // Only the part of an arrow that would move counts: an end on existing content stays where it is.
      const free = [action.start, action.end].filter((pt) => !annotatable.some((a) => near(pt, a, ANCHOR_REACH)))
      if (free.length > 0) rects.push(boundsOf(free))
      continue
    }
    const rect = bodyRect(action)
    if (!rect) continue
    if (action.type === "write_text" || action.type === "write_equation") notesHeight += rect.h + 16
    else rects.push(rect)
  }
  // Writing is laid out by the adapter in one column beside the drawing; reserve that column.
  const drawing = union(rects)
  const firstNote = actions.find((a): a is Extract<DrawingAction, { type: "write_text" | "write_equation" }> =>
    (a.type === "write_text" || a.type === "write_equation") && !annotations.has(a))
  const notes = notesHeight > 0
    ? drawing
      ? { x: drawing.x + drawing.w + NOTES_GAP, y: drawing.y, w: NOTES_WIDTH, h: notesHeight }
      : firstNote ? { x: firstNote.position.x, y: firstNote.position.y, w: NOTES_WIDTH, h: notesHeight } : null
    : null
  const block = union([...(drawing ? [drawing] : []), ...(notes ? [notes] : [])])
  if (!block) return { steps, dx: 0, dy: 0 }

  const offset = nearestClearOffset(block, obstacles)
  if (!offset || (offset.dx === 0 && offset.dy === 0)) return { steps, dx: 0, dy: 0 }

  const moved = steps.map((step) => ({
    ...step,
    actions: step.actions.map((a) => (annotations.has(a) ? a : shiftAction(a, offset.dx, offset.dy, annotatable))),
  }))
  return { steps: moved, dx: offset.dx, dy: offset.dy }
}
