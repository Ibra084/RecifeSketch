import { describe, expect, it } from "vitest"
import { checkSteps, type Skill } from "./math-check"
import { generatePractice, markPractice } from "./practice"

/** Deterministic pseudo-random numbers, so these tests are repeatable. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

describe("generatePractice", () => {
  it("makes a new question for each skill whose own answer checks out", () => {
    for (const skill of ["expand_brackets", "simplify_expression", "solve_linear_equation"] as Skill[]) {
      for (let seed = 1; seed <= 40; seed++) {
        const q = generatePractice(skill, "3(x + 2) = 3x + 2", seeded(seed))
        const working = skill === "solve_linear_equation" ? [q.start, q.answer] : [`${q.start} = ${q.answer}`]
        expect(checkSteps(skill, working), `${skill} seed ${seed}: ${q.start} -> ${q.answer}`).toEqual({ status: "correct" })
      }
    }
  })

  it("is different from the original mistake (avoids its numbers)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const q = generatePractice("expand_brackets", "3(x + 2) = 3x + 2", seeded(seed))
      expect(q.start).not.toMatch(/\b3\b|\b2\b/)
      expect(q.prompt).toMatch(/^Expand /)
    }
  })
})

describe("markPractice - TEST D", () => {
  const question = { skill: "expand_brackets" as const, prompt: "Expand 4(x + 3)", start: "4(x + 3)", answer: "4x + 12" }

  it("accepts the right answer, with or without the question copied out", () => {
    expect(markPractice(question, ["4x + 12"])).toEqual({ result: "correct" })
    expect(markPractice(question, ["4(x + 3) = 4x + 12"])).toEqual({ result: "correct" })
  })

  it("rejects 4x + 3 (the same distribution mistake)", () => {
    expect(markPractice(question, ["4x + 3"]).result).toBe("incorrect")
  })

  it("marks a linear equation by checking every step and the final answer", () => {
    const eq = { skill: "solve_linear_equation" as const, prompt: "Solve 2x + 5 = 17", start: "2x + 5 = 17", answer: "x = 6" }
    expect(markPractice(eq, ["2x = 12", "x = 6"])).toEqual({ result: "correct" })
    expect(markPractice(eq, ["2x = 22", "x = 11"]).result).toBe("incorrect")
    expect(markPractice(eq, ["2x = 12"]).result).toBe("unfinished")
  })

  it("never marks unreadable working as wrong", () => {
    expect(markPractice(question, ["4x + ???"]).result).toBe("unverified")
    expect(markPractice(question, []).result).toBe("unverified")
  })
})
