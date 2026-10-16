import type { TutorContext } from "./context"
import type { TeachingPlan } from "./teaching-protocol"
import type { UsageEstimate } from "./usage-tracker"
import type { QuestionSource } from "./question-source"

/**
 * The provider seam: everything downstream (the pipeline, the API route)
 * talks only to this interface, never to a specific vendor SDK. Swapping
 * the "initial provider is Gemini" decision for a different one later
 * means writing one new file that implements this interface - nothing
 * else changes.
 */

export type TeachingPlanFailure =
  | { kind: "missing_api_key" }
  | { kind: "timeout" }
  | { kind: "rate_limited" }
  | { kind: "invalid_output"; detail: string }
  | { kind: "provider_error"; detail: string; httpStatus?: number }
  | { kind: "cancelled" }

export interface TeachingPlanSuccess {
  ok: true
  plan: TeachingPlan
  usage: UsageEstimate
}

export interface TeachingPlanFailureResult {
  ok: false
  failure: TeachingPlanFailure
}

export type TeachingPlanResult = TeachingPlanSuccess | TeachingPlanFailureResult

export interface TeachingPlanRequest {
  question: string
  source?: QuestionSource
  /** Compact summary of what's already on the board and recent history, for follow-ups. */
  context?: TutorContext
}

export interface AIProvider {
  generateTeachingPlan(request: TeachingPlanRequest, signal?: AbortSignal): Promise<TeachingPlanResult>
}
