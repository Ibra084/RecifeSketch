import { describe, expect, it } from "vitest"
import { estimateUsage, usageFromMeasuredTokens } from "./usage-tracker"

describe("estimateUsage", () => {
  it("approximates token counts from character counts", () => {
    const usage = estimateUsage({ promptChars: 4000, responseChars: 2000 })
    // ~4 chars/token is a standard rough approximation for English text.
    expect(usage.approxInputTokens).toBeGreaterThan(0)
    expect(usage.approxOutputTokens).toBeGreaterThan(0)
    expect(usage.approxInputTokens).toBeGreaterThan(usage.approxOutputTokens)
  })

  it("marks itself as not measured", () => {
    expect(estimateUsage({ promptChars: 100, responseChars: 100 }).measured).toBe(false)
  })

  it("produces a non-negative, finite cost estimate", () => {
    const usage = estimateUsage({ promptChars: 10_000, responseChars: 5_000 })
    expect(usage.estimatedCostUsd).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(usage.estimatedCostUsd)).toBe(true)
  })

  it("returns zero usage for empty input", () => {
    const usage = estimateUsage({ promptChars: 0, responseChars: 0 })
    expect(usage.approxInputTokens).toBe(0)
    expect(usage.approxOutputTokens).toBe(0)
    expect(usage.estimatedCostUsd).toBe(0)
  })

  it("scales cost roughly linearly with size", () => {
    const small = estimateUsage({ promptChars: 1000, responseChars: 1000 })
    const large = estimateUsage({ promptChars: 10_000, responseChars: 10_000 })
    expect(large.estimatedCostUsd).toBeGreaterThan(small.estimatedCostUsd)
  })
})

describe("usageFromMeasuredTokens", () => {
  it("uses the real token counts directly, with no char-based guessing", () => {
    const usage = usageFromMeasuredTokens(100, 50)
    expect(usage.approxInputTokens).toBe(100)
    expect(usage.approxOutputTokens).toBe(50)
  })

  it("marks itself as measured", () => {
    expect(usageFromMeasuredTokens(100, 50).measured).toBe(true)
  })

  it("produces a non-negative, finite cost", () => {
    const usage = usageFromMeasuredTokens(100_000, 50_000)
    expect(usage.estimatedCostUsd).toBeGreaterThan(0)
    expect(Number.isFinite(usage.estimatedCostUsd)).toBe(true)
  })

  it("applies the same per-token pricing as the estimate path for an equal token count", () => {
    // estimateUsage(4 chars/token) and usageFromMeasuredTokens should agree
    // on cost when fed the token counts that approximation implies.
    const estimated = estimateUsage({ promptChars: 400, responseChars: 200 })
    const measured = usageFromMeasuredTokens(100, 50)
    expect(measured.estimatedCostUsd).toBeCloseTo(estimated.estimatedCostUsd, 10)
  })
})
