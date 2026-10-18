import { describe, expect, it } from "vitest"
import { decideCheck } from "./decide"
import { checkWorkModelSchema, type CheckWorkModelOutput } from "./schema"

/** A model reading, as the AI would return it (run through the same schema the route uses). */
function reading(overrides: Partial<Record<keyof CheckWorkModelOutput, unknown>>): CheckWorkModelOutput {
  return checkWorkModelSchema.parse({
    readable: true,
    confidence: "high",
    skill: "expand_brackets",
    steps: [{ text: "3(x + 2) = 3x + 2", box: [100, 50, 200, 600] }],
    errorStep: 0,
    concept: "Expanding brackets",
    misconception: "Only the first term inside the bracket was multiplied by 3.",
    hint: "What should 3 multiply - just the x, or everything inside the bracket?",
    explanation: "The 3 multiplies both x and 2, giving 3x + 6.",
    ...overrides,
  })
}

describe("decideCheck", () => {
  it("TEST A: a verified distribution error is highlighted, hinted first, and can be saved", () => {
    const result = decideCheck(reading({}), { sourceBoardId: "board-1" })
    expect(result.verdict).toBe("mistake")
    expect(result.box).toEqual([100, 50, 200, 600])
    expect(result.hint).toMatch(/multiply/)
    expect(result.correction).toContain("3(x+2) = 3x+6") // the correct expansion is in the (hidden) correction
    expect(result.draft).toMatchObject({
      subject: "maths",
      skill: "expand_brackets",
      concept: "Expanding brackets",
      incorrectStep: "3(x + 2) = 3x + 2",
      correctRelationship: "3(x + 2) = 3x + 6",
      sourceBoardId: "board-1",
    })
  })

  it("TEST B: correct work is accepted even if the AI wrongly claims an error", () => {
    const result = decideCheck(reading({ steps: [{ text: "3(x + 2) = 3x + 6" }], errorStep: 0 }), { sourceBoardId: null })
    expect(result.verdict).toBe("correct")
    expect(result.draft).toBeUndefined()
  })

  it("never offers to save a misconception the AI and the checker don't agree on", () => {
    // The checker finds the error in step 1, but the AI blamed step 0.
    const result = decideCheck(
      reading({ steps: [{ text: "2(x + 3) + 4" }, { text: "= 2x + 3 + 4" }, { text: "= 2x + 7" }], errorStep: 0 }),
      { sourceBoardId: null }
    )
    expect(result.verdict).toBe("mistake")
    expect(result.draft).toBeUndefined()
    expect(result.hint).toMatch(/step before/)
  })

  it("TEST F: unreadable, unsure or unsupported work gets an honest message, not a correction", () => {
    expect(decideCheck(reading({ readable: false }), { sourceBoardId: null }).verdict).toBe("uncertain")
    expect(decideCheck(reading({ confidence: "low" }), { sourceBoardId: null }).verdict).toBe("uncertain")
    expect(decideCheck(reading({ skill: "other" }), { sourceBoardId: null }).verdict).toBe("uncertain")
    expect(decideCheck(reading({ steps: [{ text: "3(x + 2) = 3x + ?" }] }), { sourceBoardId: null }).verdict).toBe("uncertain")
    // Garbage from the model is tidied by the schema rather than crashing.
    expect(decideCheck(checkWorkModelSchema.parse({ steps: "nonsense" }), { sourceBoardId: null }).verdict).toBe("uncertain")
  })

  it("TEST D: marks a practice attempt against the stored question", () => {
    const practice = { skill: "expand_brackets" as const, prompt: "Expand 4(x + 3)", start: "4(x + 3)", answer: "4x + 12" }
    expect(decideCheck(reading({ steps: [{ text: "4x + 12" }], errorStep: null }), { practice, sourceBoardId: null })).toMatchObject({ verdict: "correct", practice: "correct" })
    expect(decideCheck(reading({ steps: [{ text: "4x + 3" }], errorStep: 0 }), { practice, sourceBoardId: null })).toMatchObject({ verdict: "mistake", practice: "incorrect" })
  })
})
