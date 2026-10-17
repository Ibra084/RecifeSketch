import { describe, expect, it } from "vitest"
import {
  protectEarlierWork,
  visualPlanIssue,
  resolveTeachingPlanIds,
  teachingPlanSchema,
  toDrawingSequence,
  type TeachingPlan,
} from "./teaching-protocol"

function validPlan(): unknown {
  return {
    concept: "Pythagorean theorem",
    level: "ks3",
    steps: [
      {
        commentary: "First, let's draw a right-angled triangle.",
        actions: [
          {
            type: "create_shape",
            id: "triangle",
            shape: "triangle",
            x: 0,
            y: 0,
            w: 120,
            h: 80,
            color: "blue",
          },
        ],
      },
      {
        commentary: "Now label the hypotenuse.",
        pauseAfterMs: 400,
        actions: [
          { type: "write_text", id: "label", position: { x: 10, y: 100 }, text: "c" },
        ],
      },
    ],
  }
}

describe("teachingPlanSchema", () => {
  it("accepts a well-formed teaching plan", () => {
    const result = teachingPlanSchema.safeParse(validPlan())
    expect(result.success).toBe(true)
  })

  it("rejects a plan with zero steps", () => {
    const plan = validPlan() as { steps: unknown[] }
    plan.steps = []
    expect(teachingPlanSchema.safeParse(plan).success).toBe(false)
  })

  it("rejects a step with zero actions", () => {
    const plan = validPlan() as { steps: Array<{ actions: unknown[] }> }
    plan.steps[0].actions = []
    expect(teachingPlanSchema.safeParse(plan).success).toBe(false)
  })

  it("rejects a step with an invalid action", () => {
    const plan = validPlan() as { steps: Array<{ actions: unknown[] }> }
    plan.steps[0].actions = [{ type: "create_shape", id: "x", shape: "not-a-shape" }]
    expect(teachingPlanSchema.safeParse(plan).success).toBe(false)
  })

  it("rejects commentary that is empty", () => {
    const plan = validPlan() as { steps: Array<{ commentary: string }> }
    plan.steps[0].commentary = ""
    expect(teachingPlanSchema.safeParse(plan).success).toBe(false)
  })

  it("rejects unknown top-level fields", () => {
    const plan = validPlan() as Record<string, unknown>
    plan.extra = "nope"
    expect(teachingPlanSchema.safeParse(plan).success).toBe(false)
  })
})

describe("toDrawingSequence", () => {
  it("maps each teaching step to a drawing step with the same actions and pause", () => {
    const plan = teachingPlanSchema.parse(validPlan())
    const sequence = toDrawingSequence(plan)

    expect(sequence).toHaveLength(2)
    expect(sequence[0].actions).toEqual(plan.steps[0].actions)
    expect(sequence[0].pauseAfterMs).toBeUndefined()
    expect(sequence[1].pauseAfterMs).toBe(400)
  })
})

describe("resolveTeachingPlanIds", () => {
  it("keeps a force attached to its object when that object's id is renamed to avoid a collision", () => {
    const plan = teachingPlanSchema.parse({
      concept: "forces", level: "ks4", steps: [{ commentary: "Weight acts down.", actions: [
        { type: "create_shape", id: "A", shape: "rectangle", x: 0, y: 0, w: 80, h: 40 },
        { type: "draw_force", id: "W", on: "A", angle: 270 },
      ] }],
    })
    const [shape, force] = resolveTeachingPlanIds(plan, ["A"]).steps[0].actions
    expect(shape).toMatchObject({ id: "A-2" })
    expect(force).toMatchObject({ type: "draw_force", on: "A-2" })
  })

  it("leaves ids unchanged when there is no collision with existing ids", () => {
    const plan = teachingPlanSchema.parse(validPlan())
    const resolved = resolveTeachingPlanIds(plan, [])

    const ids = resolved.steps.flatMap((step) =>
      step.actions.map((action) => ("id" in action ? action.id : null))
    )
    expect(ids).toEqual(["triangle", "label"])
  })

  it("leaves commentary and non-id fields untouched", () => {
    const plan = teachingPlanSchema.parse(validPlan())
    const resolved = resolveTeachingPlanIds(plan, [])

    expect(resolved.steps[0].commentary).toBe(plan.steps[0].commentary)
    expect(resolved.concept).toBe(plan.concept)
  })

  it("does not touch actions that have no id field", () => {
    const plan: TeachingPlan = {
      concept: "test",
      level: "ks3",
      steps: [
        {
          commentary: "clearing",
          actions: [{ type: "clear_region", region: { x: 0, y: 0, w: 10, h: 10 } }],
        },
      ],
    }
    const resolved = resolveTeachingPlanIds(plan, [])
    expect(resolved.steps[0].actions[0]).toEqual(plan.steps[0].actions[0])
  })

  it("renames a new object's id when it collides with an id from an earlier turn", () => {
    const plan = teachingPlanSchema.parse(validPlan())
    const resolved = resolveTeachingPlanIds(plan, ["triangle"])

    const ids = resolved.steps.flatMap((step) =>
      step.actions.map((action) => ("id" in action ? action.id : null))
    )
    expect(ids).toEqual(["triangle-2", "label"])
  })

  it("renames a second within-plan create that reuses an id already used earlier in the same plan", () => {
    const plan: TeachingPlan = {
      concept: "test",
      level: "ks3",
      steps: [
        {
          commentary: "first",
          actions: [{ type: "create_shape", id: "box", shape: "rectangle", x: 0, y: 0, w: 10, h: 10 }],
        },
        {
          commentary: "second",
          actions: [{ type: "create_shape", id: "box", shape: "ellipse", x: 20, y: 20, w: 10, h: 10 }],
        },
      ],
    }
    const resolved = resolveTeachingPlanIds(plan, [])
    const ids = resolved.steps.map((step) => (step.actions[0] as { id: string }).id)
    expect(ids).toEqual(["box", "box-2"])
  })

  it("remaps a later reference in the same plan to a renamed id", () => {
    const plan: TeachingPlan = {
      concept: "test",
      level: "ks3",
      steps: [
        {
          commentary: "first",
          actions: [{ type: "create_shape", id: "box", shape: "rectangle", x: 0, y: 0, w: 10, h: 10 }],
        },
        {
          commentary: "highlight it",
          actions: [{ type: "highlight_object", id: "box" }],
        },
      ],
    }
    // "box" collides with something from an earlier turn, so it gets renamed -
    // the highlight later in THIS plan must follow the rename, not point at
    // the old (now-reused-by-someone-else) id.
    const resolved = resolveTeachingPlanIds(plan, ["box"])

    const createdId = (resolved.steps[0].actions[0] as { id: string }).id
    const highlightedId = (resolved.steps[1].actions[0] as { id: string }).id
    expect(createdId).toBe("box-2")
    expect(highlightedId).toBe("box-2")
  })

  it("passes a reference to a genuinely pre-existing id through unchanged - the core follow-up-editing case", () => {
    const plan: TeachingPlan = {
      concept: "test",
      level: "ks3",
      steps: [
        {
          commentary: "highlighting the coil from before",
          actions: [{ type: "highlight_object", id: "primary-coil" }],
        },
      ],
    }
    const resolved = resolveTeachingPlanIds(plan, ["primary-coil"])
    expect((resolved.steps[0].actions[0] as { id: string }).id).toBe("primary-coil")
  })
})

describe("protectEarlierWork", () => {
  const plan = teachingPlanSchema.parse({
    concept: "graphs", level: "ks4", steps: [{ commentary: "Now y = sin x.", actions: [
      { type: "delete_object", id: "graph1" },
      { type: "clear_region", region: { x: 0, y: 0, w: 600, h: 400 } },
      { type: "draw_graph", id: "graph2", position: { x: 0, y: 0 }, expressions: [{ latex: "y=\sin(x)" }] },
      { type: "delete_object", id: "scratch" },
    ] }],
  })
  const kept = (question: string) => protectEarlierWork(plan, ["graph1"], question).steps[0].actions.map((a) => a.type + ("id" in a ? `:${a.id}` : ""))

  it("keeps an earlier graph when a new graph is asked for", () => {
    expect(kept("Now draw y = sin x")).toEqual(["draw_graph:graph2", "delete_object:scratch"])
  })
  it("lets the student remove earlier work when they ask to", () => {
    expect(kept("Remove the old graph and draw y = sin x")).toHaveLength(4)
    expect(kept("Clear the board")).toHaveLength(4)
  })
})

describe("visualPlanIssue", () => {
  const textOnly = teachingPlanSchema.parse({ concept: "reciprocal graphs", level: "ks4", steps: [
    { commentary: "The roots of f(x) become vertical asymptotes.", actions: [{ type: "write_text", id: "t1", position: { x: 0, y: 0 }, text: "Roots become asymptotes" }] },
  ] })
  it("sends back a plan that only writes text", () => {
    expect(visualPlanIssue(textOnly, "Help me with this question")).toMatch(/must DRAW something visual/)
  })
  it("sends back a graph question whose first steps don't draw the graph", () => {
    const boxesOnly = teachingPlanSchema.parse({ concept: "reciprocal graphs", level: "ks4", steps: [
      { commentary: "Look at the asymptote.", actions: [{ type: "create_shape", id: "b", shape: "rectangle", x: 0, y: 0, w: 50, h: 20 }] },
    ] })
    expect(visualPlanIssue(boxesOnly, "Sketch the graph of y = 1/f(x)")).toMatch(/FIRST step must draw the graph/)
  })
  it("accepts a graph question that draws its graph straight away", () => {
    const graphed = teachingPlanSchema.parse({ concept: "reciprocal graphs", level: "ks4", steps: [
      { commentary: "Here is y = 1/f(x).", actions: [{ type: "draw_graph", id: "g", position: { x: 0, y: 0 }, expressions: [{ latex: "y=\frac{1}{x^2-2x}" }] }] },
    ] })
    expect(visualPlanIssue(graphed, "Sketch the graph of y = 1/f(x)")).toBeNull()
  })
  it("accepts a non-graph diagram answer", () => {
    const diagram = teachingPlanSchema.parse({ concept: "forces", level: "ks3", steps: [
      { commentary: "The block.", actions: [{ type: "create_shape", id: "blk", shape: "rectangle", x: 0, y: 0, w: 80, h: 40 }] },
    ] })
    expect(visualPlanIssue(diagram, "What forces act on a block resting on a table?")).toBeNull()
  })
})

describe("copied figure parts", () => {
  it("keeps part ids unique and points later actions at the renamed part", () => {
    const plan = teachingPlanSchema.parse({ concept: "pulleys", level: "ks4", steps: [{ commentary: "Copy the figure.", actions: [
      { type: "copy_figure", id: "fig", box: [0, 0, 500, 500], position: { x: 0, y: 0 }, parts: [{ id: "A", box: [10, 10, 50, 50] }] },
      { type: "draw_force", id: "T", on: "A", direction: "up" },
    ] }] })
    const [copy, force] = resolveTeachingPlanIds(plan, ["A"]).steps[0].actions
    expect(copy).toMatchObject({ parts: [{ id: "A-2" }] })
    expect(force).toMatchObject({ on: "A-2" })
  })
})
