import { describe, expect, it } from "vitest"
import { convertAbsBars } from "./abs-bars"
import { toDesmosLatex } from "./desmos-latex"

describe("toDesmosLatex", () => {
  // Every input here was checked against Desmos: the left side errors there, the right side plots.
  it.each([
    ["y=|x|", "y=\\left|x\\right|"],
    ["y=|x-2|-1", "y=\\left|x-2\\right|-1"],
    ["y=2|x|", "y=2\\left|x\\right|"],
    ["y=|2x-1|", "y=\\left|2x-1\\right|"],
    ["y=abs(x)", "y=\\operatorname{abs}(x)"],
    ["y=sqrt(x)", "y=\\sqrt{x}"],
    ["y=sin(x)", "y=\\sin(x)"],
    ["y=cos(2x)", "y=\\cos(2x)"],
    ["y=tan(x)", "y=\\tan(x)"],
    ["y=ln(x)", "y=\\ln(x)"],
    ["y=log(x)", "y=\\log(x)"],
    ["y=pi*x", "y=\\pi*x"],
    ["y=x^(1/2)", "y=x^{1/2}"],
  ])("%s -> %s", (input, expected) => {
    expect(toDesmosLatex(input)).toBe(expected)
  })

  it.each([
    // Desmos rejects a power written on the function name ("sin3 is not supported, otherwise use parens").
    ["y = \\sin^3(x) + \\ln(x)", "y = \\left(\\sin(x)\\right)^{3} + \\ln(x)"],
    ["y=\\sin^{2}(2x)", "y=\\left(\\sin(2x)\\right)^{2}"],
    ["y=sin^2(x)", "y=\\left(\\sin(x)\\right)^{2}"],
    ["y=\\cos^2 x", "y=\\left(\\cos(x)\\right)^{2}"],
    ["y=\\sin^2\\theta", "y=\\left(\\sin(\\theta)\\right)^{2}"],
    ["y=\\sin^{-1}(x)", "y=\\arcsin(x)"],
    ["y=\\tan^{-1} x", "y=\\arctan(x)"],
  ])("moves a power off the function name: %s -> %s", (input, expected) => {
    expect(toDesmosLatex(input)).toBe(expected)
  })

  it("leaves proper LaTeX alone", () => {
    for (const latex of ["y=\\left|x\\right|", "y=\\sin(x)", "y=\\sqrt{x}", "y=\\frac{1}{x}", "y=\\pi x", "(2,0)", "y=x^2-4", "y=e^x", "y=\\sinh(x)"]) {
      expect(toDesmosLatex(latex)).toBe(latex)
    }
  })

  it("handles nested bars, inequalities, words in \\text and JSON-mangled backslashes", () => {
    expect(toDesmosLatex("y=||x|-1|")).toBe("y=\\left|\\left|x\\right|-1\\right|")
    expect(toDesmosLatex("y<=|x|")).toBe("y\\le \\left|x\\right|")
    expect(toDesmosLatex("y=sqrt(abs(x))")).toBe("y=\\sqrt{\\operatorname{abs}(x)}")
    expect(toDesmosLatex("y=\frac{1}{x}")).toBe("y=\\frac{1}{x}") // "\f" from JSON
    expect(toDesmosLatex("$y=sinh(x)$")).toBe("y=\\sinh(x)")
  })
})

describe("convertAbsBars", () => {
  it("pairs bars by context", () => {
    expect(convertAbsBars("|x|+|y|", "[", "]")).toBe("[x]+[y]")
    expect(convertAbsBars("2|x-1|", "[", "]")).toBe("2[x-1]")
  })
  it("refuses unbalanced bars rather than guessing", () => {
    expect(() => convertAbsBars("|x", "[", "]")).toThrow(/Unbalanced/)
  })
})
