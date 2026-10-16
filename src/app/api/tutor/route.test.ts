import { describe, expect, it } from "vitest"
import { FakeAIProvider } from "@/lib/ai/fake-provider"
import { createRateLimiter } from "@/lib/ai/rate-limiter"
import type { TeachingPlan } from "@/lib/ai/teaching-protocol"
import { handleTutorRequest, type TutorRouteDeps } from "./route"

/**
 * Exercises the route handler directly with injected fakes - no real
 * network, no real Next.js server. `handleTutorRequest` is the seam that
 * makes this possible: `POST` itself just wires real singletons into it.
 */

function samplePlan(): TeachingPlan {
  return {
    concept: "Simple circuits",
    level: "ks3",
    steps: [
      {
        commentary: "A circuit needs a complete loop.",
        actions: [
          { type: "create_shape", id: "battery", shape: "rectangle", x: 0, y: 0, w: 60, h: 30 },
        ],
      },
    ],
  }
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

function openDeps(provider = new FakeAIProvider({
  ok: true,
  plan: samplePlan(),
  usage: { approxInputTokens: 1, approxOutputTokens: 1, estimatedCostUsd: 0, measured: false },
})): TutorRouteDeps {
  return {
    provider,
    rateLimiter: createRateLimiter({ capacity: 100, refillPerSec: 100 }),
    isConfigured: true,
  }
}

describe("handleTutorRequest", () => {
  it("passes a past-paper source and its page coordinates to the provider", async () => {
    const provider = new FakeAIProvider({ ok: true, plan: samplePlan(), usage: { approxInputTokens: 1, approxOutputTokens: 1, estimatedCostUsd: 0, measured: false } })
    const source = { text: "A resistor has V=10 V and R=5 Ω. Find its current.", region: { x: 80, y: 80, w: 600, h: 120 } }
    const response = await handleTutorRequest(makeRequest({ question: "Give me a hint", source }), openDeps(provider))
    expect(response.status).toBe(200)
    expect(provider.requests[0].source).toEqual(source)
  })

  it("rejects an unsupported attachment before calling the model", async () => {
    const provider = new FakeAIProvider({ ok: true, plan: samplePlan(), usage: { approxInputTokens: 1, approxOutputTokens: 1, estimatedCostUsd: 0, measured: false } })
    const response = await handleTutorRequest(makeRequest({ question: "Annotate", source: { image: { mimeType: "text/html", data: "a".repeat(32), width: 100, height: 100 } } }), openDeps(provider))
    expect(response.status).toBe(400)
    expect(provider.requests).toHaveLength(0)
  })
  it("returns the teaching plan on success, with ids unchanged when there's no prior context", async () => {
    const response = await handleTutorRequest(makeRequest({ question: "How do circuits work?" }), openDeps())
    expect(response.status).toBe(200)

    const json = await response.json()
    expect(json.ok).toBe(true)
    expect(json.plan.concept).toBe("Simple circuits")
    expect(json.plan.steps[0].actions[0].id).toBe("battery")
  })

  it("renames a new object's id when it collides with an id already on the board", async () => {
    const response = await handleTutorRequest(
      makeRequest({
        question: "How do circuits work?",
        context: {
          objects: [{ id: "battery", kind: "shape", x: 0, y: 0, w: 10, h: 10 }],
          history: [],
        },
      }),
      openDeps()
    )
    expect(response.status).toBe(200)

    const json = await response.json()
    expect(json.plan.steps[0].actions[0].id).toBe("battery-2")
  })

  it("passes a follow-up's existing-object context through to the provider", async () => {
    const provider = new FakeAIProvider({
      ok: true,
      plan: samplePlan(),
      usage: { approxInputTokens: 1, approxOutputTokens: 1, estimatedCostUsd: 0, measured: false },
    })
    const context = {
      objects: [{ id: "primary-coil", kind: "shape", label: "Primary coil", x: 0, y: 0, w: 10, h: 10 }],
      history: [{ question: "Explain transformers", concept: "Transformers", lastCommentary: "Drew coils." }],
    }

    await handleTutorRequest(makeRequest({ question: "Why does it need AC?", context }), openDeps(provider))

    expect(provider.requests).toEqual([{ question: "Why does it need AC?", context }])
  })

  it("rejects a non-object body with 400", async () => {
    const response = await handleTutorRequest(makeRequest({ wrong: "field" }), openDeps())
    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.ok).toBe(false)
  })

  it("rejects malformed JSON with 400", async () => {
    const request = new Request("http://localhost/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    })
    const response = await handleTutorRequest(request, openDeps())
    expect(response.status).toBe(400)
  })

  it("returns 500 with code missing_api_key when not configured", async () => {
    const deps = { ...openDeps(), isConfigured: false }
    const response = await handleTutorRequest(makeRequest({ question: "A question" }), deps)
    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.error.code).toBe("missing_api_key")
  })

  it("returns 429 when the rate limit is exhausted", async () => {
    const rateLimiter = createRateLimiter({ capacity: 1, refillPerSec: 0.0001 })
    const deps = { ...openDeps(), rateLimiter }
    await handleTutorRequest(makeRequest({ question: "first" }, { "x-forwarded-for": "1.2.3.4" }), deps)
    const response = await handleTutorRequest(
      makeRequest({ question: "second" }, { "x-forwarded-for": "1.2.3.4" }),
      deps
    )
    expect(response.status).toBe(429)
  })

  it("returns 502 when the provider reports invalid output", async () => {
    const provider = new FakeAIProvider({ ok: false, failure: { kind: "invalid_output", detail: "bad json" } })
    const response = await handleTutorRequest(makeRequest({ question: "A question" }), openDeps(provider))
    expect(response.status).toBe(502)
  })

  it("returns 504 on provider timeout", async () => {
    const provider = new FakeAIProvider({ ok: false, failure: { kind: "timeout" } })
    const response = await handleTutorRequest(makeRequest({ question: "A question" }), openDeps(provider))
    expect(response.status).toBe(504)
  })

  it("rejects an oversized body with 400 before parsing it", async () => {
    const response = await handleTutorRequest(
      makeRequest({ question: "x".repeat(20_000) }),
      openDeps()
    )
    expect(response.status).toBe(400)
  })
})
