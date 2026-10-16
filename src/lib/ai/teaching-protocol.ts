import { z } from "zod"
import { CREATING_ACTION_TYPES, drawingActionSchema } from "../drawing/protocol"
import type { DrawingAction } from "../drawing/protocol"
import type { DrawingSequence } from "../drawing/playback/types"

/**
 * The structured output contract for the AI tutor.
 *
 * This is deliberately a superset of a `DrawingSequence`: each step also
 * carries the short teaching commentary that goes with it, so the chat
 * panel can surface it in sync with the drawing instead of the model
 * having to make a second call (or us guessing at a mapping).
 */

export const MAX_TEACHING_STEPS = 12
export const MAX_ACTIONS_PER_STEP = 20
export const MAX_COMMENTARY_LENGTH = 400

export const teachingLevelSchema = z.enum(["ks3", "ks4"])
export type TeachingLevel = z.infer<typeof teachingLevelSchema>

export const teachingStepSchema = z.strictObject({
  commentary: z.string().min(1, "commentary must not be empty").max(MAX_COMMENTARY_LENGTH),
  actions: z.array(drawingActionSchema).min(1, "a step needs at least one action").max(MAX_ACTIONS_PER_STEP),
  pauseAfterMs: z.number().int().min(0).max(5000).optional(),
})
export type TeachingStep = z.infer<typeof teachingStepSchema>

export const teachingPlanSchema = z.strictObject({
  concept: z.string().min(1).max(200),
  level: teachingLevelSchema,
  steps: z.array(teachingStepSchema).min(1, "a plan needs at least one step").max(MAX_TEACHING_STEPS),
})
export type TeachingPlan = z.infer<typeof teachingPlanSchema>

export function toDrawingSequence(plan: TeachingPlan): DrawingSequence {
  return plan.steps.map((step) => {
    const drawingStep: DrawingSequence[number] = { actions: step.actions }
    if (step.pauseAfterMs !== undefined) drawingStep.pauseAfterMs = step.pauseAfterMs
    return drawingStep
  })
}

const CREATING = new Set<string>(CREATING_ACTION_TYPES)

/**
 * Makes a plan's ids safe to execute against a board that already has
 * objects on it, without breaking the model's ability to *reference* that
 * existing content.
 *
 * Follow-up editing only works if the model can reuse a real id from an
 * earlier turn (e.g. `highlight_object` on "primary-coil") and have it
 * pass through untouched - so, unlike Phase 4's blanket per-request
 * prefixing, this never rewrites a referencing action's id. It only steps
 * in when a *new* object's id would actually collide with something
 * already known (either from an earlier turn, via `existingIds`, or from
 * an earlier step of this very plan, if the model accidentally reuses a
 * name) - in which case it gets a short numeric suffix, and any later
 * reference *within this same plan* to the original id is remapped to
 * follow the rename.
 */
export function resolveTeachingPlanIds(plan: TeachingPlan, existingIds: readonly string[]): TeachingPlan {
  const known = new Set(existingIds)
  const renames = new Map<string, string>()

  function uniqueIdFor(id: string): string {
    if (!known.has(id)) return id
    let suffix = 2
    let candidate = `${id}-${suffix}`
    while (known.has(candidate)) {
      suffix += 1
      candidate = `${id}-${suffix}`
    }
    return candidate
  }

  const steps = plan.steps.map((step) => ({
    ...step,
    actions: step.actions.map((action): DrawingAction => {
      if (!("id" in action)) return action

      if (CREATING.has(action.type)) {
        const resolvedId = uniqueIdFor(action.id)
        if (resolvedId !== action.id) renames.set(action.id, resolvedId)
        known.add(resolvedId)
        // A force belongs to the object this plan calls `on` - follow that object if it was renamed.
        if (action.type === "draw_force") return { ...action, id: resolvedId, on: renames.get(action.on) ?? action.on }
        if (action.type === "draw_on_incline") return { ...action, id: resolvedId, incline: renames.get(action.incline) ?? action.incline }
        if (action.type === "draw_apparatus") {
          return {
            ...action, id: resolvedId,
            ...(action.on ? { on: renames.get(action.on) ?? action.on } : {}),
            ...(action.inside ? { inside: renames.get(action.inside) ?? action.inside } : {}),
          }
        }
        return { ...action, id: resolvedId }
      }

      return { ...action, id: renames.get(action.id) ?? action.id }
    }),
  }))

  return { ...plan, steps }
}

/** Actions that put a picture on the board - not just words. */
const VISUAL_ACTIONS = new Set<DrawingAction["type"]>([
  "create_shape", "create_freehand_path", "create_polygon", "draw_line", "draw_arrow", "draw_force",
  "draw_curve", "draw_repeated_curve", "plot_function", "update_plot", "draw_graph", "update_graph", "mark_image", "highlight_text", "draw_apparatus", "draw_incline", "draw_on_incline",
])
const GRAPH_ACTIONS = new Set<DrawingAction["type"]>(["draw_graph", "update_graph", "plot_function", "update_plot"])
const GRAPH_TOPIC = /\b(graphs?|sketch|plot|curves?|asymptotes?|parabola|gradient|intercepts?|turning points?|transformations?|reciprocal|modulus|axes|coordinates)\b|\by\s*=|\bf\s*\(\s*x\s*\)/i

/**
 * Why a plan isn't visual enough to send, or null if it is. Recife exists
 * for visual learners: every answer must draw something, and a graph
 * question must draw the graph straight away (in its first two steps)
 * rather than only describe it. The topic is judged from the question and
 * from the plan's own words, since a pasted question image can't be read here.
 */
export function visualPlanIssue(plan: TeachingPlan, question: string): string | null {
  const actions = plan.steps.flatMap((step) => step.actions)
  if (!actions.some((action) => VISUAL_ACTIONS.has(action.type))) {
    return "The plan only writes text. Every answer must DRAW something visual (a graph, diagram, " +
      "labelled sketch, arrows or marks on the question) - add it, starting in the first step."
  }
  const words = [question, ...plan.steps.map((step) => step.commentary),
    ...actions.flatMap((action) => (action.type === "write_text" ? [action.text] : action.type === "write_equation" ? [action.expression] : []))].join(" ")
  const drawsGraphEarly = plan.steps.slice(0, 2).some((step) => step.actions.some((action) => GRAPH_ACTIONS.has(action.type)))
  if (GRAPH_TOPIC.test(words) && !drawsGraphEarly) {
    return "This is a graph question: the FIRST step must draw the graph itself (draw_graph, or " +
      "plot_function if draw_graph is unavailable) - for a transformed graph like y = 1/f(x), draw the " +
      "resulting graph (with the original for comparison). Explain beside it afterwards, never instead of it."
  }
  return null
}

/** The student asked for something to go: "delete", "remove", "clear", "erase", "replace", "start again"... */
const REMOVAL_INTENT = /\b(delete|remove|clear|erase|wipe|replace|get rid|start (again|over)|redo|undo|tidy)\b/i

/**
 * Earlier work stays on the board unless the student asked for it to go.
 * Drops actions that would delete an object from an earlier turn, or clear
 * a region of the board, when the question shows no wish to remove
 * anything - so a new graph or diagram is drawn beside the old one rather
 * than replacing it. Objects this plan creates itself can still be removed.
 */
export function protectEarlierWork(plan: TeachingPlan, existingIds: readonly string[], question: string): TeachingPlan {
  if (REMOVAL_INTENT.test(question)) return plan
  const earlier = new Set(existingIds)
  const steps = plan.steps.map((step) => ({
    ...step,
    actions: step.actions.filter((action) =>
      action.type !== "clear_region" && !(action.type === "delete_object" && earlier.has(action.id))
    ),
  }))
  return { ...plan, steps }
}

export function countTotalActions(plan: TeachingPlan): number {
  return plan.steps.reduce((sum, step) => sum + step.actions.length, 0)
}
