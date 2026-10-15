import type { TeachingPlanFailure } from "./provider"

/**
 * Whether a failure is worth retrying on its own (a flaky connection, a
 * provider having a bad moment) rather than something retrying can never
 * fix (no key, a deliberate rate limit, the user cancelling, or output
 * that was already well-formed-request/badly-shaped-response - which has
 * its own dedicated repair-prompt retry in the provider, not this one).
 */
export function isTransientFailure(failure: TeachingPlanFailure): boolean {
  return failure.kind === "timeout" || failure.kind === "provider_error"
}

export const MAX_TRANSIENT_RETRIES = 1
export const TRANSIENT_RETRY_DELAY_MS = 400
