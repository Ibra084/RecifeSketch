import { teachingPlanSchema, countTotalActions, type TeachingPlan } from "./teaching-protocol"

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
  | { ok: false; error: TeachingPlanParseError }

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

export function parseTeachingPlanResponse(raw: string): TeachingPlanParseResult {
  const unfenced = stripCodeFence(raw)

  let json: unknown
  try {
    json = JSON.parse(unfenced)
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
    return { ok: false, error: { kind: "schema", message } }
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
