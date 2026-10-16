import { describe, expect, it } from "vitest"
import { formatEquation, sanitizeMathNotation, toDisplayMath } from "./math-notation"

describe("toDisplayMath", () => {
  it("turns caret exponents into superscripts for reading", () => {
    expect(toDisplayMath("x^2 + 3x^-1")).toBe("x² + 3x⁻¹")
  })
  it("also fixes LaTeX slips", () => {
    expect(toDisplayMath("F = m \\times a")).toBe("F = m × a")
  })
  it("leaves non-numeric carets alone", () => {
    expect(toDisplayMath("a^b")).toBe("a^b")
  })
})

describe("formatEquation", () => {
  it("turns typed operators and units into textbook symbols", () => {
    expect(formatEquation("Weight = 55 kg * 9.8 m/s^2 = 539 N")).toBe("Weight = 55 kg × 9.8 m/s² = 539 N")
    expect(formatEquation("x >= 2, y <= 3, a != b")).toBe("x ≥ 2, y ≤ 3, a ≠ b")
  })
  it("writes subscripts as real subscripts", () => {
    expect(formatEquation("F_net = m*a")).toBe("Fₙₑₜ = m × a")
    expect(formatEquation("v_0 + a_{t}")).toBe("v₀ + aₜ")
  })
  it("handles braced and bracketed exponents", () => {
    expect(formatEquation("x^{n+1} + e^(2x)")).toBe("xⁿ⁺¹ + e²ˣ")
    expect(formatEquation("10^-3")).toBe("10⁻³")
  })
  it("leaves scripts with no Unicode form readable rather than half-converting them", () => {
    expect(formatEquation("m_lift + v_0")).toBe("m_lift + v₀")
  })
})

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
