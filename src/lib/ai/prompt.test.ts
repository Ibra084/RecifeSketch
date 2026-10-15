import { describe, expect, it } from "vitest"
import type { TutorContext } from "./context"
import { buildRepairPrompt, buildTeachingPrompt } from "./prompt"

describe("buildTeachingPrompt", () => {
  it("includes the student's question verbatim", () => {
    const prompt = buildTeachingPrompt("Why does ice float on water?")
    expect(prompt).toContain("Why does ice float on water?")
  })

  it("instructs the model to respond with JSON only", () => {
    const prompt = buildTeachingPrompt("What is a fraction?")
    expect(prompt.toLowerCase()).toContain("json")
  })

  it("names every supported drawing action type so the model knows its vocabulary", () => {
    const prompt = buildTeachingPrompt("Explain gravity")
    for (const actionType of [
      "create_shape",
      "create_freehand_path",
      "create_polygon",
      "draw_line",
      "draw_arrow",
      "write_text",
      "write_equation",
      "plot_function",
      "move_object",
      "update_object",
      "delete_object",
      "highlight_object",
      "clear_region",
      "focus_camera",
    ]) {
      expect(prompt).toContain(actionType)
    }
  })

  it("forbids image generation and hardcoded diagram libraries", () => {
    const prompt = buildTeachingPrompt("Explain photosynthesis").toLowerCase()
    expect(prompt).toMatch(/image/)
  })

  it("forbids hand-drawing a precise-looking graph outside plot_function", () => {
    const prompt = buildTeachingPrompt("Explain velocity").toLowerCase()
    expect(prompt).toMatch(/never hand-draw axes/)
    expect(prompt).toMatch(/conceptual sketch/)
  })

  it("does not blow up on a long or unusual question", () => {
    const longQuestion = "why ".repeat(200)
    expect(() => buildTeachingPrompt(longQuestion)).not.toThrow()
  })

  it("omits any existing-object section when there is no context", () => {
    const prompt = buildTeachingPrompt("Explain gravity").toLowerCase()
    expect(prompt).not.toContain("already on the whiteboard")
  })

  it("includes existing object ids and prior history when context is given", () => {
    const context: TutorContext = {
      objects: [{ id: "primary-coil", kind: "shape", label: "Primary coil", x: 0, y: 0, w: 100, h: 50 }],
      history: [
        { question: "Explain how a transformer works.", concept: "Transformers", lastCommentary: "Drew the coils." },
      ],
    }
    const prompt = buildTeachingPrompt("Why does it need alternating current?", context)

    expect(prompt).toContain("primary-coil")
    expect(prompt).toContain("Explain how a transformer works.")
    expect(prompt).toContain("Why does it need alternating current?")
  })
})

describe("buildRepairPrompt", () => {
  it("includes the original question, the invalid output and the validation error", () => {
    const prompt = buildRepairPrompt({
      question: "What is Newton's second law?",
      invalidResponse: "{ this is not valid json",
      errorMessage: "Unexpected token in JSON",
    })

    expect(prompt).toContain("What is Newton's second law?")
    expect(prompt).toContain("{ this is not valid json")
    expect(prompt).toContain("Unexpected token in JSON")
  })

  it("asks the model to fix the output", () => {
    const prompt = buildRepairPrompt({
      question: "q",
      invalidResponse: "bad",
      errorMessage: "err",
    })
    expect(prompt.toLowerCase()).toMatch(/fix|correct|invalid/)
  })
})
