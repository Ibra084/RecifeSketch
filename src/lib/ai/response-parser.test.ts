import { describe, expect, it } from "vitest"
import { MAX_TOTAL_ACTIONS, parseTeachingPlanResponse } from "./response-parser"

function validPlanJson(): string {
  return JSON.stringify({
    concept: "Photosynthesis",
    level: "ks3",
    steps: [
      {
        commentary: "Plants take in sunlight, water and carbon dioxide.",
        actions: [
          { type: "create_shape", id: "leaf", shape: "ellipse", x: 0, y: 0, w: 100, h: 60, color: "green" },
        ],
      },
    ],
  })
}

describe("parseTeachingPlanResponse", () => {
  it("parses a well-formed JSON response", () => {
    const result = parseTeachingPlanResponse(validPlanJson())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.plan.concept).toBe("Photosynthesis")
    }
  })

  it("strips a ```json markdown code fence before parsing", () => {
    const fenced = "```json\n" + validPlanJson() + "\n```"
    const result = parseTeachingPlanResponse(fenced)
    expect(result.ok).toBe(true)
  })

  it("strips a plain ``` code fence before parsing", () => {
    const fenced = "```\n" + validPlanJson() + "\n```"
    const result = parseTeachingPlanResponse(fenced)
    expect(result.ok).toBe(true)
  })

  it("reports a parse error for invalid JSON", () => {
    const result = parseTeachingPlanResponse("{not json")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("json")
    }
  })

  it("reports a schema error for JSON that doesn't match the teaching plan shape", () => {
    const result = parseTeachingPlanResponse(JSON.stringify({ hello: "world" }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("schema")
      expect(result.error.message.length).toBeGreaterThan(0)
    }
  })

  it("rejects a plan whose total action count exceeds the cap", () => {
    // Spread actions across many steps (20/step, under the per-step and
    // per-plan schema caps individually) so the total-action cap is the
    // thing that actually trips, not the schema's own per-step limit.
    const actionsPerStep = 20
    const stepsNeeded = Math.ceil((MAX_TOTAL_ACTIONS + 1) / actionsPerStep)
    const steps = Array.from({ length: stepsNeeded }, (_, stepIndex) => ({
      commentary: `step ${stepIndex}`,
      actions: Array.from({ length: actionsPerStep }, (_, i) => ({
        type: "create_shape" as const,
        id: `s${stepIndex}-${i}`,
        shape: "rectangle" as const,
        x: 0,
        y: 0,
        w: 10,
        h: 10,
      })),
    }))
    const plan = { concept: "Too much", level: "ks3", steps }
    const result = parseTeachingPlanResponse(JSON.stringify(plan))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("too_many_actions")
    }
  })

  it("rejects a non-object top-level JSON value", () => {
    const result = parseTeachingPlanResponse(JSON.stringify([1, 2, 3]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("schema")
    }
  })
})
