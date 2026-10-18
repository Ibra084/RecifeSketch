import { describe, expect, it } from "vitest"
import type { TeachingPlan } from "@/lib/ai/teaching-protocol"
import { applySecondLook, figureNeedingSecondLook, secondLookCrop } from "./second-look"

function pulleyLesson(): TeachingPlan {
  return {
    concept: "Pulleys",
    level: "ks4",
    steps: [
      {
        commentary: "Copy the diagram.",
        actions: [
          {
            type: "copy_figure", id: "fig", box: [200, 100, 600, 500], position: { x: 0, y: 0 },
            parts: [{ id: "mass_3kg", box: [500, 120, 580, 220] }, { id: "mass_2kg", box: [500, 380, 580, 480] }],
          },
        ],
      },
      { commentary: "Weights.", actions: [{ type: "draw_force", id: "w3", on: "mass_3kg", angle: 270, label: "3g" }] },
    ],
  }
}

describe("second look at a copied figure", () => {
  it("only applies to a lesson that copies a figure with named parts", () => {
    expect(figureNeedingSecondLook(pulleyLesson())?.id).toBe("fig")
    const noParts = pulleyLesson()
    noParts.steps[0].actions = [{ type: "copy_figure", id: "fig", box: [200, 100, 600, 500], position: { x: 0, y: 0 } }]
    expect(figureNeedingSecondLook(noParts)).toBeUndefined()
  })

  it("crops around the figure and all its parts, with margin", () => {
    const crop = secondLookCrop(figureNeedingSecondLook(pulleyLesson())!)
    expect(crop).toEqual([140, 40, 660, 560])
  })

  it("replaces the first guesses with the located boxes, mapped back to the whole image", () => {
    const plan = pulleyLesson()
    const figure = figureNeedingSecondLook(plan)!
    const crop = secondLookCrop(figure) // [140, 40, 660, 560]: 520 x 520 of the image
    // In the crop, the 3 kg mass is really lower than first guessed - and the figure extends lower too.
    const refined = applySecondLook(plan, figure, crop, {
      figure: [100, 100, 950, 900],
      parts: [{ id: "mass_3kg", box: [800, 100, 950, 300] }, { id: "not_a_part", box: [0, 0, 10, 10] }],
    })
    const copy = refined.steps[0].actions[0] as Extract<TeachingPlan["steps"][number]["actions"][number], { type: "copy_figure" }>
    const mass3 = copy.parts!.find((p) => p.id === "mass_3kg")!.box
    ;[140 + 0.8 * 520, 40 + 0.1 * 520, 140 + 0.95 * 520, 40 + 0.3 * 520].forEach((v, i) => expect(mass3[i]).toBeCloseTo(v, 6))
    expect(copy.parts!.find((p) => p.id === "mass_2kg")!.box).toEqual([500, 380, 580, 480]) // not found: first guess kept
    expect(copy.parts!.map((p) => p.id)).toEqual(["mass_3kg", "mass_2kg"]) // unknown ids ignored
    expect(copy.box[2]).toBeGreaterThanOrEqual(mass3[2]) // the crop takes in the whole mass
    expect(refined.steps[1]).toBe(plan.steps[1]) // everything else untouched
  })

  it("returns the plan unchanged when nothing was found", () => {
    const plan = pulleyLesson()
    const figure = figureNeedingSecondLook(plan)!
    expect(applySecondLook(plan, figure, secondLookCrop(figure), { parts: [] })).toBe(plan)
  })
})
