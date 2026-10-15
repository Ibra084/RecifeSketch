import { describe, expect, it } from "vitest"
import { sanitizeMathNotation } from "./math-notation"

describe("sanitizeMathNotation", () => {
  it("replaces \\times with the multiplication sign", () => {
    expect(sanitizeMathNotation("F = m \\times a")).toBe("F = m × a")
  })

  it("replaces common LaTeX comparison and arithmetic commands", () => {
    expect(sanitizeMathNotation("\\leq")).toBe("≤")
    expect(sanitizeMathNotation("\\geq")).toBe("≥")
    expect(sanitizeMathNotation("\\neq")).toBe("≠")
    expect(sanitizeMathNotation("\\pm")).toBe("±")
    expect(sanitizeMathNotation("\\div")).toBe("÷")
    expect(sanitizeMathNotation("\\cdot")).toBe("·")
  })

  it("replaces common LaTeX greek letters and symbols", () => {
    expect(sanitizeMathNotation("\\pi r^2")).toBe("π r^2")
    expect(sanitizeMathNotation("\\Delta x")).toBe("Δ x")
    expect(sanitizeMathNotation("\\theta")).toBe("θ")
    expect(sanitizeMathNotation("\\infty")).toBe("∞")
    expect(sanitizeMathNotation("\\sqrt{x}")).toBe("√{x}")
  })

  it("leaves plain, already-legible expressions untouched", () => {
    expect(sanitizeMathNotation("a^2 + b^2 = c^2")).toBe("a^2 + b^2 = c^2")
    expect(sanitizeMathNotation("F = m * a")).toBe("F = m * a")
  })

  it("replaces every occurrence, not just the first", () => {
    expect(sanitizeMathNotation("\\times \\times")).toBe("× ×")
  })
})
