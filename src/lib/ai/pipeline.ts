import type { TutorContext } from "./context"
import type { AIProvider, TeachingPlanFailure } from "./provider"
import type { RateLimiter } from "./rate-limiter"
import type { TeachingPlan } from "./teaching-protocol"
import type { UsageEstimate } from "./usage-tracker"

/**
 * Orchestrates one tutor request: validates the question, enforces the
 * rate limit, then delegates to the provider. This is the testable core
 * of the API route - everything here is pure/injectable, so the route
 * handler itself only has to wire real implementations together.
 */

export const MAX_QUESTION_LENGTH = 500

export type TeachingPipelineFailure = TeachingPlanFailure | { kind: "invalid_question"; detail: string }

export type TeachingPipelineResult =
  | { ok: true; plan: TeachingPlan; usage: UsageEstimate }
  | { ok: false; failure: TeachingPipelineFailure }

export interface RunTeachingPipelineInput {
  question: string
  context?: TutorContext
  clientKey: string
  provider: AIProvider
  rateLimiter: RateLimiter
  isConfigured: boolean
  signal?: AbortSignal
}

export async function runTeachingPipeline(
  input: RunTeachingPipelineInput
): Promise<TeachingPipelineResult> {
  const question = input.question.trim()

  if (question.length === 0) {
    return { ok: false, failure: { kind: "invalid_question", detail: "question must not be empty" } }
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return {
      ok: false,
      failure: {
        kind: "invalid_question",
        detail: `question must be at most ${MAX_QUESTION_LENGTH} characters`,
      },
    }
  }

  if (!input.isConfigured) {
    return { ok: false, failure: { kind: "missing_api_key" } }
  }

  if (!input.rateLimiter.tryConsume(input.clientKey)) {
    return { ok: false, failure: { kind: "rate_limited" } }
  }

  const result = await input.provider.generateTeachingPlan(
    { question, context: input.context },
    input.signal
  )
  if (!result.ok) return { ok: false, failure: result.failure }
  return { ok: true, plan: result.plan, usage: result.usage }
}
