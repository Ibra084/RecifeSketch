import { describe, expect, it } from "vitest"
import {
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
