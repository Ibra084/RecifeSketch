import { describe, expect, it } from "vitest"
import { escapeLatexBackslashes } from "./latex-json"

const parse = (raw: string) => JSON.parse(escapeLatexBackslashes(raw))

describe("escapeLatexBackslashes", () => {
  it("leaves correctly escaped LaTeX alone", () => {
    expect(parse(String.raw`{"e":"\\frac{1}{2}\\,\\text{kg}"}`).e).toBe(String.raw`\frac{1}{2}\,\text{kg}`)
  })

  it("rescues single backslashes that are not JSON escapes", () => {
    expect(parse(String.raw`{"e":"m = 950\,\text{g} = 0.95\,\text{kg}"}`).e).toBe(String.raw`m = 950\,\text{g} = 0.95\,\text{kg}`)
    expect(parse(String.raw`{"e":"T - \mu m_A g \cos 30^{\circ}"}`).e).toBe(String.raw`T - \mu m_A g \cos 30^{\circ}`)
  })

  it("keeps LaTeX commands that look like JSON escapes (\\text, \\frac, \\nu, \\right, \\beta)", () => {
    expect(parse(String.raw`{"e":"\frac{a}{b} \times \theta \nu \right) \beta \neq"}`).e)
      .toBe(String.raw`\frac{a}{b} \times \theta \nu \right) \beta \neq`)
  })

  it("still reads real newlines, tabs, quotes and unicode escapes", () => {
    expect(parse(String.raw`{"e":"Line one\nNow two\t\"q\" °"}`).e).toBe("Line one\nNow two\t\"q\" °")
  })
})
