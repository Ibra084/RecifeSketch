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

  it("includes the exact field path in the schema error, so a repair retry knows what to fix", () => {
    const plan = JSON.parse(validPlanJson())
    // A real failure seen in live testing: the model sent the wrong type
    // for a field deep inside an action.
    plan.steps[0].actions[0].x = "not-a-number"
    const result = parseTeachingPlanResponse(JSON.stringify(plan))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toContain("steps.0.actions.0.x")
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

  it("reads LaTeX written with single backslashes (a real Gemini answer that used to fail)", () => {
    const raw = validPlanJson().replace(
      `{"type":"create_shape"`,
      String.raw`{"type":"write_equation","id":"m","position":{"x":0,"y":0},"expression":"m = 950\,\text{g} = \frac{\mu}{2}"},{"type":"create_shape"`
    )
    const result = parseTeachingPlanResponse(raw)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const eq = result.plan.steps[0].actions[0]
      expect(eq.type === "write_equation" && eq.expression).toBe(String.raw`m = 950\,\text{g} = \frac{\mu}{2}`)
    }
  })

  it("salvages the valid actions of a plan with one malformed action", () => {
    const plan = JSON.parse(validPlanJson())
    plan.steps[0].actions.push({ type: "create_shape", id: "bad", shape: "rectangle", x: "nope", y: 0, w: 1, h: 1 })
    plan.steps.push({ commentary: "x".repeat(600), actions: [{ type: "create_shape", id: "ok2", shape: "ellipse", x: 0, y: 0, w: 5, h: 5 }] })
    const result = parseTeachingPlanResponse(JSON.stringify(plan))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.salvaged?.steps).toHaveLength(2)
      expect(result.salvaged?.steps[0].actions.map((a) => ("id" in a ? a.id : ""))).toEqual(["leaf"])
      expect(result.salvaged?.steps[1].commentary.length).toBe(400)
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
