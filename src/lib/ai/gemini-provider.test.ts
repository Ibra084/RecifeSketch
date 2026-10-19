import { describe, expect, it } from "vitest"
import { loadAIConfig } from "./config"
import { GeminiProvider } from "./gemini-provider"

/** A fetch that never answers until its request is aborted - a provider that hangs. */
const hangingFetch: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
  })

describe("GeminiProvider deadline", () => {
  it("uses the configured backup on overload and preserves the question image", async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    const config = loadAIConfig({ GEMINI_API_KEY: "secret-test", GEMINI_FALLBACK_MODEL: "gemini-3.5-flash", AI_MAX_COST_PER_PROMPT_USD: "1" })
    const provider = new GeminiProvider({ config, fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init })
      if (calls.length === 1) return new Response("overloaded", { status: 503 })
      const plan = { concept: "Current", level: "ks3", steps: [{ commentary: "Use Ohm's law.", actions: [
        { type: "create_shape", id: "resistor", shape: "rectangle", x: 100, y: 60, w: 80, h: 30 },
        { type: "write_text", id: "hint", position: { x: 100, y: 100 }, text: "I = V / R" },
      ] }] }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }))
    } })
    const image = { mimeType: "image/png" as const, data: "test-image", width: 100, height: 100 }
    expect((await provider.generateTeachingPlan({ question: "Help", source: { image } })).ok).toBe(true)
    expect(calls).toHaveLength(2)
    expect(calls[1].url).toContain("gemini-3.5-flash:")
    for (const call of calls) {
      expect(call.url).not.toContain("secret-test")
      expect(new Headers(call.init?.headers).get("x-goog-api-key")).toBe("secret-test")
      expect(JSON.parse(String(call.init?.body)).contents[0].parts[1].inlineData.data).toBe("test-image")
    }
  })

  it("sends the question image first in full detail, then the student's working, and no detail setting without images", async () => {
    const bodies: { contents: { parts: Record<string, unknown>[] }[]; generationConfig: Record<string, unknown> }[] = []
    const plan = { concept: "Pulleys", level: "ks4", steps: [{ commentary: "Look at the masses.", actions: [
      { type: "create_shape", id: "m", shape: "ellipse", x: 0, y: 0, w: 40, h: 40 },
    ] }] }
    const provider = new GeminiProvider({ config: loadAIConfig({ GEMINI_API_KEY: "k" }), fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }))
    } })
    const question = { mimeType: "image/png" as const, data: "question-image", width: 733, height: 669 }
    const working = { mimeType: "image/jpeg" as const, data: "working-image", width: 900, height: 400 }
    const region = { x: 0, y: 0, w: 733, h: 669 }
    await provider.generateTeachingPlan({ question: "Help", source: { image: question, region, work: { image: working, region } } })
    const parts = bodies[0].contents[0].parts
    expect(parts.map((p) => (p.inlineData as { data?: string } | undefined)?.data)).toEqual([undefined, "question-image", "working-image"])
    expect(bodies[0].generationConfig.mediaResolution).toBe("MEDIA_RESOLUTION_HIGH")
    expect(String(parts[0].text)).toContain("refers to the FIRST image")

    await provider.generateTeachingPlan({ question: "What is a pulley?" })
    expect(bodies[1].generationConfig.mediaResolution).toBeUndefined()
  })

  it("does not switch models to bypass a rate limit", async () => {
    let calls = 0
    const config = loadAIConfig({ GEMINI_API_KEY: "test", GEMINI_FALLBACK_MODEL: "gemini-3.5-flash" })
    const provider = new GeminiProvider({ config, fetchImpl: async () => { calls++; return new Response("", { status: 429 }) } })
    expect(await provider.generateTeachingPlan({ question: "Help" })).toEqual({ ok: false, failure: { kind: "rate_limited" } })
    expect(calls).toBe(1)
  })
  it("bounds the whole request (all retries together) by requestTimeoutMs, not each attempt", async () => {
    const config = loadAIConfig({ GEMINI_API_KEY: "test-only", AI_MAX_RETRIES: "1", AI_REQUEST_TIMEOUT_MS: "200" })
    let calls = 0
    const provider = new GeminiProvider({
      config,
      fetchImpl: (url, init) => {
        calls++
        return hangingFetch(url, init)
      },
    })

    const started = Date.now()
    const result = await provider.generateTeachingPlan({ question: "Help me" })
    const elapsed = Date.now() - started

    expect(result).toEqual({ ok: false, failure: { kind: "timeout" } })
    // Per-attempt timeouts would take ~2 x 200ms plus the retry delay; one shared deadline stops at ~200ms.
    expect(elapsed).toBeLessThan(380)
    expect(calls).toBe(1)
  })
})

describe("visual answers", () => {
  it("sends a text-only answer back once with the reason, and uses the visual retry", async () => {
    const bodies: string[] = []
    const config = loadAIConfig({ GEMINI_API_KEY: "test", AI_MAX_RETRIES: "1" })
    const provider = new GeminiProvider({ config, fetchImpl: async (_url, init) => {
      bodies.push(String(init?.body))
      const actions = bodies.length === 1
        ? [{ type: "write_text", id: "t", position: { x: 0, y: 0 }, text: "Roots become asymptotes" }]
        : [{ type: "draw_graph", id: "g", position: { x: 0, y: 0 }, expressions: [{ latex: "y=\\frac{1}{x}" }] }]
      const plan = { concept: "Reciprocal graphs", level: "ks4", steps: [{ commentary: "Sketch it.", actions }] }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }] }))
    } })
    const result = await provider.generateTeachingPlan({ question: "Sketch the graph of y = 1/f(x)" })
    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toContain("must DRAW something visual")
    expect(result.ok && result.plan.steps[0].actions[0].type).toBe("draw_graph")
  })
})

describe("per-prompt cost budget", () => {
  const visualPlan = { concept: "Current", level: "ks3", steps: [{ commentary: "Use Ohm's law.", actions: [
    { type: "create_shape", id: "resistor", shape: "rectangle", x: 100, y: 60, w: 80, h: 30 },
  ] }] }
  const textOnlyPlan = { concept: "Reciprocal graphs", level: "ks4", steps: [{ commentary: "Sketch it.", actions: [
    { type: "write_text", id: "t", position: { x: 0, y: 0 }, text: "Roots become asymptotes" },
  ] }] }
  const answer = (plan: unknown, usageMetadata?: Record<string, number>) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(plan) }] } }], usageMetadata }))

  it("leaves a normal lesson's full output allowance alone", async () => {
    const bodies: { generationConfig: { maxOutputTokens: number } }[] = []
    const provider = new GeminiProvider({ config: loadAIConfig({ GEMINI_API_KEY: "k" }), fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return answer(visualPlan)
    } })
    const image = { mimeType: "image/png" as const, data: "img", width: 100, height: 100 }
    expect((await provider.generateTeachingPlan({ question: "Help", source: { image } })).ok).toBe(true)
    expect(bodies[0].generationConfig.maxOutputTokens).toBe(8192)
  })

  it("retries the cheap model instead of a backup that would break the budget", async () => {
    const urls: string[] = []
    const config = loadAIConfig({ GEMINI_API_KEY: "k", GEMINI_FALLBACK_MODEL: "gemini-3.5-flash" })
    const provider = new GeminiProvider({ config, fetchImpl: async (url) => {
      urls.push(String(url))
      return urls.length === 1 ? new Response("overloaded", { status: 503 }) : answer(visualPlan)
    } })
    expect((await provider.generateTeachingPlan({ question: "Help" })).ok).toBe(true)
    expect(urls).toHaveLength(2)
    expect(urls[1]).toContain("gemini-3.1-flash-lite:")
  })

  it("counts the repair call in the prompt's cost", async () => {
    let calls = 0
    const provider = new GeminiProvider({ config: loadAIConfig({ GEMINI_API_KEY: "k" }), fetchImpl: async () => {
      calls++
      return answer(calls === 1 ? textOnlyPlan : { ...textOnlyPlan, steps: [{ commentary: "Sketch it.", actions: [
        { type: "draw_graph", id: "g", position: { x: 0, y: 0 }, expressions: [{ latex: "y=\frac{1}{x}" }] },
      ] }] }, { promptTokenCount: 10_000, candidatesTokenCount: 2_000 })
    } })
    const result = await provider.generateTeachingPlan({ question: "Sketch the graph of y = 1/f(x)" })
    expect(calls).toBe(2)
    expect(result.ok && result.usage.approxInputTokens).toBe(20_000)
    expect(result.ok && result.usage.estimatedCostUsd).toBeCloseTo(2 * (0.0025 + 0.003), 6)
  })

  it("keeps the first valid answer when a repair can't be afforded, and never goes over", async () => {
    let calls = 0
    const config = loadAIConfig({ GEMINI_API_KEY: "k", AI_MAX_COST_PER_PROMPT_USD: "0.02" })
    const provider = new GeminiProvider({ config, fetchImpl: async () => {
      calls++
      return answer(textOnlyPlan, { promptTokenCount: 20_000, candidatesTokenCount: 6_000, thoughtsTokenCount: 2_000 })
    } })
    const result = await provider.generateTeachingPlan({ question: "Sketch the graph of y = 1/f(x)" })
    expect(calls).toBe(1)
    expect(result.ok && result.plan.steps[0].actions[0].type).toBe("write_text")
    expect(result.ok && result.usage.estimatedCostUsd).toBeLessThanOrEqual(0.02)
  })
})
