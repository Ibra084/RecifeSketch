import { drawingActionSchema } from "../drawing/protocol"
import { escapeLatexBackslashes } from "./latex-json"
import {
  MAX_ACTIONS_PER_STEP, MAX_COMMENTARY_LENGTH, MAX_TEACHING_STEPS, teachingPlanSchema, countTotalActions, type TeachingPlan,
} from "./teaching-protocol"

/**
 * Turns the AI provider's raw text response into a validated `TeachingPlan`.
 *
 * Pure and network-free on purpose: the provider implementation hands this
 * function a string, nothing else, so the parsing/validation rules can be
 * tested without ever making a real API call.
 */

export const MAX_TOTAL_ACTIONS = 150

export type TeachingPlanParseError =
  | { kind: "json"; message: string }
  | { kind: "schema"; message: string }
  | { kind: "too_many_actions"; message: string }

export type TeachingPlanParseResult =
  | { ok: true; plan: TeachingPlan }
  /** `salvaged`: the plan with its malformed actions left out - worth using if a repair attempt fails too. */
  | { ok: false; error: TeachingPlanParseError; salvaged?: TeachingPlan }

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

export function parseTeachingPlanResponse(raw: string): TeachingPlanParseResult {
  const unfenced = stripCodeFence(raw)

  let json: unknown
  try {
    json = JSON.parse(escapeLatexBackslashes(unfenced))
  } catch (error) {
    return {
      ok: false,
      error: { kind: "json", message: error instanceof Error ? error.message : String(error) },
    }
  }

  const parsed = teachingPlanSchema.safeParse(json)
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ")
    const salvaged = salvagePlan(json)
    return { ok: false, error: { kind: "schema", message }, ...(salvaged ? { salvaged } : {}) }
  }

  if (countTotalActions(parsed.data) > MAX_TOTAL_ACTIONS) {
    return {
      ok: false,
      error: {
        kind: "too_many_actions",
        message: `plan contains more than ${MAX_TOTAL_ACTIONS} total actions`,
      },
    }
  }

  return { ok: true, plan: parsed.data }
}

/**
 * Keeps what is usable from a plan that failed validation: every action
 * that is valid on its own, over-long text trimmed, extra steps dropped.
 * Returns null when nothing teachable is left.
 */
function salvagePlan(json: unknown): TeachingPlan | null {
  if (!json || typeof json !== "object" || !Array.isArray((json as { steps?: unknown }).steps)) return null
  const raw = json as { concept?: unknown; level?: unknown; steps: unknown[]; followUps?: unknown }
  const steps = raw.steps.flatMap((step) => {
    if (!step || typeof step !== "object") return []
    const { commentary, actions, pauseAfterMs } = step as { commentary?: unknown; actions?: unknown; pauseAfterMs?: unknown }
    if (typeof commentary !== "string" || !commentary.trim() || !Array.isArray(actions)) return []
    const valid = actions.flatMap((action) => {
      const parsed = drawingActionSchema.safeParse(action)
      return parsed.success ? [parsed.data] : []
    }).slice(0, MAX_ACTIONS_PER_STEP)
    if (valid.length === 0) return []
    const pause = typeof pauseAfterMs === "number" && Number.isInteger(pauseAfterMs) && pauseAfterMs >= 0 && pauseAfterMs <= 5000
    return [{ commentary: commentary.slice(0, MAX_COMMENTARY_LENGTH), actions: valid, ...(pause ? { pauseAfterMs } : {}) }]
  }).slice(0, MAX_TEACHING_STEPS)
  const plan = teachingPlanSchema.safeParse({
    concept: typeof raw.concept === "string" && raw.concept.trim() ? raw.concept.slice(0, 200) : "Lesson",
    level: raw.level === "ks3" ? "ks3" : "ks4",
    steps,
    ...(raw.followUps !== undefined ? { followUps: raw.followUps } : {}),
  })
  return plan.success && countTotalActions(plan.data) <= MAX_TOTAL_ACTIONS ? plan.data : null
}
