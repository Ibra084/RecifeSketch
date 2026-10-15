import { describe, expect, it } from "vitest"
import { FakeAIProvider } from "@/lib/ai/fake-provider"
import { createRateLimiter } from "@/lib/ai/rate-limiter"
import type { TeachingPlan } from "@/lib/ai/teaching-protocol"
import { handleTutorRequest, type TutorRouteDeps } from "./route"

/**
 * Exercises the Phase 5 CRITICAL ACCEPTANCE TEST's *mechanics* end to end
 * through the real route handler: multi-turn id stability, context
 * reaching the provider, and follow-up references surviving id
 * resolution untouched.
 *
 * IMPORTANT - what this test does and doesn't prove: `FakeAIProvider` is
 * scripted, not a real model. This proves the plumbing a real model would
 * depend on is correct (the exact ids/labels/positions from turn 1 really
 * do reach turn 2's prompt context, and a response that reuses an
 * existing id really does survive the server untouched end to end). It
 * does NOT prove a real model would choose to highlight the right coil
 * or explain flux correctly - that requires a live call with real
 * credentials, which this project does not have configured. See the
 * phase report for the real (currently blocked) acceptance test result.
 */

function openDeps(provider: FakeAIProvider): TutorRouteDeps {
  return {
    provider,
    rateLimiter: createRateLimiter({ capacity: 100, refillPerSec: 100 }),
    isConfigured: true,
  }
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/tutor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const transformerPlan: TeachingPlan = {
  concept: "Transformers",
  level: "ks3",
  steps: [
    {
      commentary: "A transformer has a primary coil wrapped around an iron core.",
      actions: [
        {
          type: "create_shape",
          id: "iron-core",
          shape: "rectangle",
          x: 100,
          y: 0,
          w: 40,
          h: 200,
          color: "grey",
        },
        {
          type: "create_shape",
          id: "primary-coil",
          shape: "rectangle",
          x: 0,
          y: 0,
          w: 90,
          h: 200,
          color: "blue",
          label: "Primary coil",
        },
      ],
    },
    {
      commentary: "The secondary coil picks up the changing magnetic flux.",
      actions: [
        {
          type: "create_shape",
          id: "secondary-coil",
          shape: "rectangle",
          x: 150,
          y: 0,
          w: 90,
          h: 200,
          color: "green",
          label: "Secondary coil",
        },
        {
          type: "draw_arrow",
          id: "flux-arrow",
          start: { x: 50, y: -20 },
          end: { x: 195, y: -20 },
          label: "magnetic flux",
        },
      ],
    },
  ],
}

describe("Phase 5 acceptance scenario (scripted - see header)", () => {
  it("question 1: draws a coherent transformer diagram with stable ids", async () => {
    const provider = new FakeAIProvider({
      ok: true,
      plan: transformerPlan,
      usage: { approxInputTokens: 10, approxOutputTokens: 10, estimatedCostUsd: 0, measured: false },
    })

    const response = await handleTutorRequest(
      makeRequest({ question: "Explain how a transformer works." }),
      openDeps(provider)
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    const ids = json.plan.steps.flatMap((step: { actions: { id?: string }[] }) =>
      step.actions.map((a) => a.id)
    )
    expect(ids).toEqual(["iron-core", "primary-coil", "secondary-coil", "flux-arrow"])
  })

  it("question 2: identifies and reuses the exact existing primary-coil id, and adds new content with a fresh id", async () => {
    // Simulates what the client would have sent as context after turn 1 -
    // i.e. the board summary `TldrawDrawingAdapter.summarizeObjects()`
    // would produce, built by hand here since there's no real tldraw
    // Editor in this test environment (same limitation as tldraw-adapter.ts
    // itself - see Phase 2/3 known limitations).
    const contextAfterTurn1 = {
      objects: [
        { id: "iron-core", kind: "shape", x: 100, y: 0, w: 40, h: 200 },
        { id: "primary-coil", kind: "shape", label: "Primary coil", x: 0, y: 0, w: 90, h: 200 },
        { id: "secondary-coil", kind: "shape", label: "Secondary coil", x: 150, y: 0, w: 90, h: 200 },
        { id: "flux-arrow", kind: "arrow", label: "magnetic flux", x: 50, y: -20, w: 145, h: 1 },
      ],
      history: [
        {
          question: "Explain how a transformer works.",
          concept: "Transformers",
          lastCommentary: "The secondary coil picks up the changing magnetic flux.",
        },
      ],
    }

    const followUpPlan: TeachingPlan = {
      concept: "Transformers",
      level: "ks3",
      steps: [
        {
          commentary: "Here's the primary coil again - notice the flux only changes if the current does.",
          actions: [{ type: "highlight_object", id: "primary-coil", color: "yellow" }],
        },
        {
          commentary: "With AC, the current constantly reverses, so the flux keeps changing and induces a voltage.",
          actions: [
            {
              type: "write_text",
              id: "ac-explanation",
              position: { x: 0, y: 230 },
              text: "AC reverses direction, so flux keeps changing",
            },
          ],
        },
      ],
    }

    const provider = new FakeAIProvider({
      ok: true,
      plan: followUpPlan,
      usage: { approxInputTokens: 10, approxOutputTokens: 10, estimatedCostUsd: 0, measured: false },
    })

    const response = await handleTutorRequest(
      makeRequest({ question: "Why does it need alternating current?", context: contextAfterTurn1 }),
      openDeps(provider)
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    // The context the "model" saw included the real ids/labels from turn 1.
    expect(provider.requests[0].context?.objects.map((o) => o.id)).toContain("primary-coil")

    // The follow-up's reference to the existing coil must survive untouched...
    expect(json.plan.steps[0].actions[0]).toEqual({
      type: "highlight_object",
      id: "primary-coil",
      color: "yellow",
    })
    // ...while the brand-new object gets its own, non-colliding id.
    expect(json.plan.steps[1].actions[0].id).toBe("ac-explanation")
  })

  it("additional test: a request to remove a previous annotation resolves to the correct existing object", async () => {
    const contextAfterTurn2 = {
      objects: [
        { id: "iron-core", kind: "shape", x: 100, y: 0, w: 40, h: 200 },
        { id: "primary-coil", kind: "shape", label: "Primary coil", x: 0, y: 0, w: 90, h: 200 },
        { id: "ac-explanation", kind: "text", label: "AC reverses direction, so flux keeps changing", x: 0, y: 230, w: 300, h: 20 },
      ],
      history: [
        { question: "Explain how a transformer works.", concept: "Transformers", lastCommentary: "Drew the coils." },
        { question: "Why does it need alternating current?", concept: "Transformers", lastCommentary: "Explained flux change." },
      ],
    }

    const correctionPlan: TeachingPlan = {
      concept: "Transformers",
      level: "ks3",
      steps: [
        {
          commentary: "You're right, let me remove that note - it wasn't quite accurate.",
          actions: [{ type: "delete_object", id: "ac-explanation" }],
        },
      ],
    }

    const provider = new FakeAIProvider({
      ok: true,
      plan: correctionPlan,
      usage: { approxInputTokens: 5, approxOutputTokens: 5, estimatedCostUsd: 0, measured: false },
    })

    const response = await handleTutorRequest(
      makeRequest({ question: "That AC explanation note is wrong, remove it.", context: contextAfterTurn2 }),
      openDeps(provider)
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.plan.steps[0].actions[0]).toEqual({ type: "delete_object", id: "ac-explanation" })
  })
})
