import { describe, expect, it } from "vitest"
import { addUsage, costFor, estimateUsage, usageFromMeasuredTokens } from "./usage-tracker"

const MODEL = "gemini-3.1-flash-lite"

describe("estimateUsage", () => {
  it("approximates token counts from character counts", () => {
    const usage = estimateUsage({ model: MODEL, promptChars: 4000, responseChars: 2000 })
    // ~4 chars/token is a standard rough approximation for English text.
    expect(usage.approxInputTokens).toBeGreaterThan(0)
    expect(usage.approxOutputTokens).toBeGreaterThan(0)
    expect(usage.approxInputTokens).toBeGreaterThan(usage.approxOutputTokens)
  })

  it("marks itself as not measured", () => {
    expect(estimateUsage({ model: MODEL, promptChars: 100, responseChars: 100 }).measured).toBe(false)
  })

  it("produces a non-negative, finite cost estimate", () => {
    const usage = estimateUsage({ model: MODEL, promptChars: 10_000, responseChars: 5_000 })
    expect(usage.estimatedCostUsd).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(usage.estimatedCostUsd)).toBe(true)
  })

  it("returns zero usage for empty input", () => {
    const usage = estimateUsage({ model: MODEL, promptChars: 0, responseChars: 0 })
    expect(usage.approxInputTokens).toBe(0)
    expect(usage.approxOutputTokens).toBe(0)
    expect(usage.estimatedCostUsd).toBe(0)
  })

  it("scales cost roughly linearly with size", () => {
    const small = estimateUsage({ model: MODEL, promptChars: 1000, responseChars: 1000 })
    const large = estimateUsage({ model: MODEL, promptChars: 10_000, responseChars: 10_000 })
    expect(large.estimatedCostUsd).toBeGreaterThan(small.estimatedCostUsd)
  })
})

describe("usageFromMeasuredTokens", () => {
  it("uses the real token counts directly, with no char-based guessing", () => {
    const usage = usageFromMeasuredTokens(MODEL, 100, 50)
    expect(usage.approxInputTokens).toBe(100)
    expect(usage.approxOutputTokens).toBe(50)
  })

  it("marks itself as measured", () => {
    expect(usageFromMeasuredTokens(MODEL, 100, 50).measured).toBe(true)
  })

  it("produces a non-negative, finite cost", () => {
    const usage = usageFromMeasuredTokens(MODEL, 100_000, 50_000)
    expect(usage.estimatedCostUsd).toBeGreaterThan(0)
    expect(Number.isFinite(usage.estimatedCostUsd)).toBe(true)
  })

  it("applies the same per-token pricing as the estimate path for an equal token count", () => {
    // estimateUsage(4 chars/token) and usageFromMeasuredTokens should agree
    // on cost when fed the token counts that approximation implies.
    const estimated = estimateUsage({ model: MODEL, promptChars: 400, responseChars: 200 })
    const measured = usageFromMeasuredTokens(MODEL, 100, 50)
    expect(measured.estimatedCostUsd).toBeCloseTo(estimated.estimatedCostUsd, 10)
  })
})

describe("costFor", () => {
  it("prices a typical lesson on Flash-Lite at about a cent", () => {
    // A real lesson from the bug reports: 28,626 input + 2,022 output tokens.
    expect(costFor(MODEL, 28_626, 2_022)).toBeCloseTo(0.0102, 4)
  })

  it("prices Flash well above Flash-Lite, and an unknown model at least as high as Flash", () => {
    expect(costFor("gemini-3.5-flash", 10_000, 2_000)).toBeGreaterThan(costFor(MODEL, 10_000, 2_000) * 5)
    expect(costFor("some-new-model", 10_000, 2_000)).toBeGreaterThanOrEqual(costFor("gemini-3.5-flash", 10_000, 2_000))
  })
})

describe("addUsage", () => {
  it("adds up every call made for one prompt", () => {
    const total = addUsage(usageFromMeasuredTokens(MODEL, 100, 50), estimateUsage({ model: MODEL, promptChars: 400, responseChars: 200 }))
    expect(total.approxInputTokens).toBe(200)
    expect(total.approxOutputTokens).toBe(100)
    expect(total.estimatedCostUsd).toBeCloseTo(costFor(MODEL, 200, 100), 10)
    expect(total.measured).toBe(false)
  })
})
