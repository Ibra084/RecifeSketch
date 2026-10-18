import { describe, expect, it } from "vitest"
import { checkSteps, equivalent, expandedForm, parseExpression, toLatex } from "./math-check"

const parse = (text: string) => parseExpression(text)!

describe("parseExpression - only plain algebra is accepted", () => {
  it("reads normal school algebra, including implicit multiplication and unicode signs", () => {
    for (const text of ["3(x + 2)", "3x + 6", "4x − 3", "2x²", "−5(2y − 1)", "x/2 + 3", "6 ÷ 2x"]) {
      expect(parseExpression(text), text).not.toBeNull()
    }
  })
  it("refuses anything that isn't plain algebra", () => {
    for (const text of ["sqrt(4)", "x = 2", "a = 1; b = 2", "import('fs')", "cos(x)", "xy2z", "[1, 2]", "5 kg", ""]) {
      expect(parseExpression(text), text).toBeNull()
    }
  })
})

describe("equivalent / expandedForm", () => {
  it("decides equality of expressions numerically and deterministically", () => {
    expect(equivalent(parse("3(x + 2)"), parse("3x + 6"))).toBe(true)
    expect(equivalent(parse("3(x + 2)"), parse("3x + 2"))).toBe(false)
    expect(equivalent(parse("2(a - b)"), parse("2a - 2b"))).toBe(true)
    expect(equivalent(parse("x + y"), parse("x + x"))).toBe(false) // variables never share a value
  })
  it("writes the expansion the way a student would", () => {
    expect(expandedForm(parse("3(x + 2)"))).toBe("3x + 6")
    expect(expandedForm(parse("-2(x - 5)"))).toBe("-2x + 10")
  })
})

describe("checkSteps - expanding brackets", () => {
  it("TEST A: finds the distribution error in 3(x + 2) = 3x + 2", () => {
    expect(checkSteps("expand_brackets", ["3(x + 2) = 3x + 2"])).toEqual({
      status: "error",
      stepIndex: 0,
      previous: "3(x + 2)",
      wrong: "3x + 2",
      correctRelationship: "3(x + 2) = 3x + 6",
    })
  })
  it("TEST B: accepts 3(x + 2) = 3x + 6 without inventing an error", () => {
    expect(checkSteps("expand_brackets", ["3(x + 2) = 3x + 6"])).toEqual({ status: "correct" })
  })
  it("works on other numbers and multi-line working (nothing is hard-coded)", () => {
    expect(checkSteps("expand_brackets", ["7(2a - 3)", "= 14a - 21"]).status).toBe("correct")
    const wrong = checkSteps("expand_brackets", ["-4(y - 5)", "= -4y - 20"])
    expect(wrong.status === "error" && wrong.correctRelationship).toBe("-4(y - 5) = -4y + 20")
  })
  it("points at the first wrong step, not a later one", () => {
    const result = checkSteps("expand_brackets", ["2(x + 3) + 4", "= 2x + 3 + 4", "= 2x + 7"])
    expect(result.status === "error" && result.stepIndex).toBe(1)
  })
  it("says when brackets are still left, rather than calling it wrong", () => {
    expect(checkSteps("expand_brackets", ["2(x + 1) + 3(x + 1)", "= 5(x + 1)"])).toMatchObject({ status: "correct", unfinished: expect.any(String) })
  })
})

describe("checkSteps - simplifying", () => {
  it("accepts a correct simplification and rejects a wrong one", () => {
    expect(checkSteps("simplify_expression", ["3x + 2 + 5x - 7 = 8x - 5"]).status).toBe("correct")
    expect(checkSteps("simplify_expression", ["3x + 2 + 5x - 7 = 8x + 5"]).status).toBe("error")
  })
})

describe("checkSteps - linear equations", () => {
  it("accepts working that keeps the same solution all the way", () => {
    expect(checkSteps("solve_linear_equation", ["2x + 3 = 11", "2x = 8", "x = 4"])).toEqual({ status: "correct" })
  })
  it("finds the step where the solution changes", () => {
    const result = checkSteps("solve_linear_equation", ["2x + 3 = 11", "2x = 14", "x = 7"])
    expect(result).toMatchObject({ status: "error", stepIndex: 1, previous: "2x + 3 = 11", wrong: "2x = 14" })
  })
  it("asks the student to finish when the variable isn't on its own yet", () => {
    expect(checkSteps("solve_linear_equation", ["5(x - 1) = 20", "5x - 5 = 20"])).toMatchObject({ status: "correct", unfinished: expect.any(String) })
  })
  it("refuses non-linear or multi-variable equations instead of guessing", () => {
    expect(checkSteps("solve_linear_equation", ["x^2 = 9", "x = 3"]).status).toBe("unsupported")
    expect(checkSteps("solve_linear_equation", ["x + y = 3"]).status).toBe("unsupported")
  })
})

describe("TEST F: unreadable or unsupported input is never marked wrong", () => {
  it("reports unsupported rather than an error", () => {
    expect(checkSteps("expand_brackets", ["3(x + 2) = ??"]).status).toBe("unsupported")
    expect(checkSteps("expand_brackets", ["sin(x)(x + 1) = x sin(x) + sin(x)"]).status).toBe("unsupported")
    expect(checkSteps("expand_brackets", []).status).toBe("unsupported")
  })
})

describe("toLatex", () => {
  it("typesets plain working for display", () => {
    expect(toLatex("3(x + 2) = 3x + 6")).toContain("=")
    expect(toLatex("3(x + 2) = 3x + 6")).not.toContain("*")
  })
})
