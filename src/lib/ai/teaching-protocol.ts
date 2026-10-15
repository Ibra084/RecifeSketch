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
        return { ...action, id: resolvedId }
      }

      return { ...action, id: renames.get(action.id) ?? action.id }
    }),
  }))

  return { ...plan, steps }
}

export function countTotalActions(plan: TeachingPlan): number {
  return plan.steps.reduce((sum, step) => sum + step.actions.length, 0)
}
