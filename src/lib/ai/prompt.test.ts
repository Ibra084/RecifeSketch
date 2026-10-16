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

  it("requires electric circuits to trace a closed conducting loop", () => {
    // Found via live browser testing: a real response for a battery +
    // resistor question drew a wire that dead-ended in empty space and a
    // "Resistor" label with no symbol behind it at all - an open circuit
    // with no indication it was meant to be open.
    const prompt = buildTeachingPrompt("Explain a simple circuit").toLowerCase()
    expect(prompt).toMatch(/trace the path/)
    expect(prompt).toMatch(/gap or dead end/)
  })

  it("tells the model each step's commentary is spoken beside that step's first object", () => {
    const prompt = buildTeachingPrompt("Explain levers").toLowerCase()
    expect(prompt).toMatch(/speech\s+bubble while that step draws/)
    expect(prompt).toMatch(/first action/)
  })

  it("requires LaTeX for equations and $...$ maths inside prose and commentary", () => {
    const prompt = buildTeachingPrompt("Explain Newton's second law")
    expect(prompt).toMatch(/expression is ONE LaTeX expression/)
    expect(prompt).toContain("\\frac{F_{\\text{net}}}{m}")
    expect(prompt).toMatch(/MUST be LaTeX in \$\.\.\.\$/)
    expect(prompt).toMatch(/Commentary is prose: put any maths in it in\s+LaTeX/)
  })

  it("colours each part of a multi-part question differently, with bold part headings", () => {
    const prompt = buildTeachingPrompt("Question 9 (a) (b) (c)")
    expect(prompt).toMatch(/part \(a\) blue, \(b\) violet, \(c\) green, \(d\) orange, \(e\) red/)
    expect(prompt).toContain('"**Part (a)** Use')
  })

  it("explains rotation and how to draw forces on an inclined plane with real trigonometry", () => {
    const prompt = buildTeachingPrompt("A block on a 30 degree slope")
    expect(prompt).toMatch(/rotation is in degrees, anticlockwise/)
    expect(prompt).toMatch(/page y points DOWN/)
    expect(prompt).toContain("(cos θ, -sin θ)")
  })

  it("makes slope directions come from the physics, not the model's own angle arithmetic", () => {
    const prompt = buildTeachingPrompt("A car brakes on a road sloping downhill at 6 degrees")
    expect(prompt).toMatch(/INCLINED PLANES - BE ULTRA CAREFUL WITH DIRECTIONS/)
    expect(prompt).toMatch(/a car moving downhill brakes "up_slope"/)
    expect(prompt).toMatch(/weight mg: "down"/)
    expect(prompt).toMatch(/normal reaction R: "normal"/)
    expect(prompt).toContain("draw_incline { id, position: {x,y}, angle, downhill:")
  })

  it("requires draw_force for every force, with every force shown and objects named by their label", () => {
    const prompt = buildTeachingPrompt("Draw the forces on the block")
    expect(prompt).toMatch(/ALWAYS use draw_force for a force on an object/)
    expect(prompt).toMatch(/shows EVERY force on each object/)
    expect(prompt).toMatch(/never a separate write_text\s+beside it/)
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
        { question: "Explain how a transformer works.", concept: "Transformers", explanation: "Drew the coils." },
      ],
    }
    const prompt = buildTeachingPrompt("Why does it need alternating current?", context)

    expect(prompt).toContain("primary-coil")
    expect(prompt).toContain("Explain how a transformer works.")
    expect(prompt).toContain("Why does it need alternating current?")
  })
})

describe("buildRepairPrompt", () => {
  it("retains the protocol and existing board ids when repairing", () => {
    const prompt = buildRepairPrompt({ question: "Move the resistor", invalidResponse: "bad", errorMessage: "invalid JSON",
      context: { objects: [{ id: "existing-resistor", kind: "shape", x: 0, y: 0, w: 100, h: 40 }], history: [] } })
    expect(prompt).toContain("existing-resistor")
    expect(prompt).toContain("move_object")
    expect(prompt).toContain("complete conducting loop")
    expect(prompt).not.toContain("earlier in THIS plan")
  })
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

describe("Desmos graphs", () => {
  it("offers draw_graph only when a Desmos key is configured", () => {
    expect(buildTeachingPrompt("Sketch y = x^2", undefined, { desmos: true })).toMatch(/Use draw_graph instead of plot_function/)
    expect(buildTeachingPrompt("Sketch y = x^2")).not.toMatch(/draw_graph \{/)
  })
})

describe("keeping earlier graphs", () => {
  it("tells the model a new graph is a new draw_graph, and update_graph only edits on request", () => {
    const prompt = buildTeachingPrompt("Now graph y = sin x", undefined, { desmos: true })
    expect(prompt).toMatch(/is a NEW draw_graph with a NEW id/)
    expect(prompt).toMatch(/ONLY when the student explicitly asks to change/)
    expect(prompt).toMatch(/Never\s+delete, clear or overwrite an earlier graph/)
  })
})

describe("graph annotations", () => {
  it("asks for notes right beside the graph, level with the feature they describe", () => {
    const prompt = buildTeachingPrompt("Sketch y = 1/f(x)", undefined, { desmos: true })
    expect(prompt).toMatch(/ANNOTATE RIGHT BESIDE THE GRAPH/)
    expect(prompt).toMatch(/level with the feature/)
  })
})

describe("lab apparatus", () => {
  it("documents every apparatus kind and requires the kit for apparatus", () => {
    const prompt = buildTeachingPrompt("Draw a beaker heated over a Bunsen burner")
    for (const kind of ["beaker", "conical_flask", "bunsen_burner", "tripod_gauze", "thermometer", "clamp_stand"]) {
      expect(prompt).toContain(`      ${kind}: width`)
    }
    expect(prompt).toMatch(/ALWAYS\s+use this for apparatus/)
    expect(prompt).toMatch(/on: "<id>"/)
  })
})
