import { describe, expect, it } from "vitest"
import { FakeAIProvider } from "./fake-provider"
import { MAX_QUESTION_LENGTH, runTeachingPipeline } from "./pipeline"
import { createRateLimiter } from "./rate-limiter"
import type { TeachingPlan } from "./teaching-protocol"

function samplePlan(): TeachingPlan {
  return {
    concept: "Levers",
    level: "ks3",
    steps: [
      {
        commentary: "A lever pivots around a fixed point.",
        actions: [
          { type: "create_shape", id: "lever", shape: "rectangle", x: 0, y: 0, w: 200, h: 10 },
        ],
      },
    ],
  }
}

function openRateLimiter() {
  return createRateLimiter({ capacity: 100, refillPerSec: 100 })
}

describe("runTeachingPipeline", () => {
  it("returns the plan and usage on success", async () => {
    const provider = new FakeAIProvider({
      ok: true,
      plan: samplePlan(),
      usage: { approxInputTokens: 10, approxOutputTokens: 5, estimatedCostUsd: 0.001, measured: false },
    })

    const result = await runTeachingPipeline({
      question: "How do levers work?",
      clientKey: "client-1",
      provider,
      rateLimiter: openRateLimiter(),
      isConfigured: true,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.concept).toBe("Levers")
    }
    expect(provider.calls).toEqual(["How do levers work?"])
  })

  it("rejects an empty question without calling the provider", async () => {
    const provider = new FakeAIProvider({ ok: true, plan: samplePlan(), usage: { approxInputTokens: 0, approxOutputTokens: 0, estimatedCostUsd: 0, measured: false } })

    const result = await runTeachingPipeline({
      question: "   ",
      clientKey: "client-1",
      provider,
      rateLimiter: openRateLimiter(),
      isConfigured: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe("invalid_question")
    expect(provider.calls).toHaveLength(0)
  })

  it("rejects an oversized question without calling the provider", async () => {
    const provider = new FakeAIProvider({ ok: true, plan: samplePlan(), usage: { approxInputTokens: 0, approxOutputTokens: 0, estimatedCostUsd: 0, measured: false } })

    const result = await runTeachingPipeline({
      question: "x".repeat(MAX_QUESTION_LENGTH + 1),
      clientKey: "client-1",
      provider,
      rateLimiter: openRateLimiter(),
      isConfigured: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe("invalid_question")
    expect(provider.calls).toHaveLength(0)
  })

  it("returns missing_api_key without calling the provider when not configured", async () => {
    const provider = new FakeAIProvider({ ok: true, plan: samplePlan(), usage: { approxInputTokens: 0, approxOutputTokens: 0, estimatedCostUsd: 0, measured: false } })

    const result = await runTeachingPipeline({
      question: "A real question",
      clientKey: "client-1",
      provider,
      rateLimiter: openRateLimiter(),
      isConfigured: false,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe("missing_api_key")
    expect(provider.calls).toHaveLength(0)
  })

  it("returns rate_limited without calling the provider once the bucket is empty", async () => {
    const provider = new FakeAIProvider({ ok: true, plan: samplePlan(), usage: { approxInputTokens: 0, approxOutputTokens: 0, estimatedCostUsd: 0, measured: false } })
    const rateLimiter = createRateLimiter({ capacity: 1, refillPerSec: 0.001 })

    await runTeachingPipeline({ question: "q1", clientKey: "same-client", provider, rateLimiter, isConfigured: true })
    const second = await runTeachingPipeline({
      question: "q2",
      clientKey: "same-client",
      provider,
      rateLimiter,
      isConfigured: true,
    })

    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.failure.kind).toBe("rate_limited")
    expect(provider.calls).toEqual(["q1"])
  })

  it("passes the context through to the provider untouched", async () => {
    const provider = new FakeAIProvider({
      ok: true,
      plan: samplePlan(),
      usage: { approxInputTokens: 0, approxOutputTokens: 0, estimatedCostUsd: 0, measured: false },
    })
    const context = {
      objects: [{ id: "primary-coil", kind: "shape", x: 0, y: 0, w: 10, h: 10 }],
      history: [],
    }

    await runTeachingPipeline({
      question: "Why does it need AC?",
      context,
      clientKey: "client-1",
      provider,
      rateLimiter: openRateLimiter(),
      isConfigured: true,
    })

    expect(provider.requests).toEqual([{ question: "Why does it need AC?", context }])
  })

  it("passes through a provider failure untouched", async () => {
    const provider = new FakeAIProvider({ ok: false, failure: { kind: "timeout" } })

    const result = await runTeachingPipeline({
      question: "A real question",
      clientKey: "client-1",
      provider,
      rateLimiter: openRateLimiter(),
      isConfigured: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.failure.kind).toBe("timeout")
  })
})
