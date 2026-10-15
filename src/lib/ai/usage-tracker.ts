/**
 * Approximate token/cost accounting, purely for cost-control visibility.
 *
 * This deliberately stays in-memory and per-request - no persistence, no
 * per-user history, no dashboard. That would drift into the "analytics"
 * feature this project explicitly keeps out of scope. It exists only so
 * server logs can show roughly what each tutor call cost.
 *
 * Token and price figures are rough, hand-picked approximations (Gemini
 * 2.5 Flash list pricing order-of-magnitude as of early 2026), not a
 * billing-accurate accounting system.
 */

const CHARS_PER_TOKEN = 4
const INPUT_USD_PER_MILLION_TOKENS = 0.075
const OUTPUT_USD_PER_MILLION_TOKENS = 0.3

export interface UsageEstimateInput {
  promptChars: number
  responseChars: number
}

export interface UsageEstimate {
  approxInputTokens: number
  approxOutputTokens: number
  estimatedCostUsd: number
  /** True when the token counts came from the provider's own reported usage, not a char-based guess. */
  measured: boolean
}

function costFor(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * INPUT_USD_PER_MILLION_TOKENS +
    (outputTokens / 1_000_000) * OUTPUT_USD_PER_MILLION_TOKENS
  )
}

export function estimateUsage({ promptChars, responseChars }: UsageEstimateInput): UsageEstimate {
  const approxInputTokens = Math.ceil(promptChars / CHARS_PER_TOKEN)
  const approxOutputTokens = Math.ceil(responseChars / CHARS_PER_TOKEN)

  return {
    approxInputTokens,
    approxOutputTokens,
    estimatedCostUsd: costFor(approxInputTokens, approxOutputTokens),
    measured: false,
  }
}

/** Builds a `UsageEstimate` from real provider-reported token counts, e.g. Gemini's `usageMetadata`. */
export function usageFromMeasuredTokens(inputTokens: number, outputTokens: number): UsageEstimate {
  return {
    approxInputTokens: inputTokens,
    approxOutputTokens: outputTokens,
    estimatedCostUsd: costFor(inputTokens, outputTokens),
    measured: true,
  }
}

/** A tiny in-memory, per-process accumulator for logging purposes only. */
export function createUsageAccumulator() {
  let totalCostUsd = 0
  let requestCount = 0

  return {
    record(usage: UsageEstimate): void {
      totalCostUsd += usage.estimatedCostUsd
      requestCount += 1
    },
    summary() {
      return { requestCount, totalCostUsd }
    },
  }
}
