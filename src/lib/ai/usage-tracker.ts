/**
 * Approximate token/cost accounting, for cost-control visibility and the
 * per-prompt cost budget.
 *
 * This deliberately stays in-memory and per-request - no persistence, no
 * per-user history, no dashboard. That would drift into the "analytics"
 * feature this project explicitly keeps out of scope. It exists so server
 * logs can show what each tutor call cost, and so the provider can keep a
 * single prompt under its budget.
 *
 * Prices are Gemini API list prices (USD per million tokens, October 2026;
 * output includes thinking tokens). An unknown model is priced like the
 * dearest one listed, so the budget errs on the safe side.
 */

const CHARS_PER_TOKEN = 4

interface ModelPrice {
  inputUsdPerMillion: number
  outputUsdPerMillion: number
}

const MODEL_PRICES: { match: RegExp; price: ModelPrice }[] = [
  { match: /flash-lite/, price: { inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.5 } },
  { match: /flash/, price: { inputUsdPerMillion: 1.5, outputUsdPerMillion: 9 } },
]
const UNKNOWN_MODEL_PRICE: ModelPrice = { inputUsdPerMillion: 2, outputUsdPerMillion: 12 }

export function priceFor(model: string): ModelPrice {
  return MODEL_PRICES.find((entry) => entry.match.test(model))?.price ?? UNKNOWN_MODEL_PRICE
}

export function costFor(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model)
  return (inputTokens / 1_000_000) * price.inputUsdPerMillion + (outputTokens / 1_000_000) * price.outputUsdPerMillion
}

export interface UsageEstimateInput {
  model: string
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

export function estimateUsage({ model, promptChars, responseChars }: UsageEstimateInput): UsageEstimate {
  const approxInputTokens = Math.ceil(promptChars / CHARS_PER_TOKEN)
  const approxOutputTokens = Math.ceil(responseChars / CHARS_PER_TOKEN)

  return {
    approxInputTokens,
    approxOutputTokens,
    estimatedCostUsd: costFor(model, approxInputTokens, approxOutputTokens),
    measured: false,
  }
}

/** Builds a `UsageEstimate` from real provider-reported token counts, e.g. Gemini's `usageMetadata`. */
export function usageFromMeasuredTokens(model: string, inputTokens: number, outputTokens: number): UsageEstimate {
  return {
    approxInputTokens: inputTokens,
    approxOutputTokens: outputTokens,
    estimatedCostUsd: costFor(model, inputTokens, outputTokens),
    measured: true,
  }
}

/** The total of several calls made for one prompt (e.g. an answer plus its repair). */
export function addUsage(a: UsageEstimate, b: UsageEstimate): UsageEstimate {
  return {
    approxInputTokens: a.approxInputTokens + b.approxInputTokens,
    approxOutputTokens: a.approxOutputTokens + b.approxOutputTokens,
    estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd,
    measured: a.measured && b.measured,
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
