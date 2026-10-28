import { describe, expect, it } from "vitest"
import { delimitBareLatex, hasInlineMath, looksLikeBareLatex, mathSourceSummary, renderLatex, renderMixed, repairJsonEscapes, stripMathDelimiters } from "./math-render"

describe("renderLatex", () => {
  it("typesets fractions and exponents as real maths markup", () => {
    const html = renderLatex("a = \\frac{F}{m} = 1.2\\,\\text{m/s}^2")
    expect(html).toContain("katex")
    expect(html).toContain("mfrac")
    expect(html).toContain("msup")
  })
  it("strips delimiters a model wraps the whole expression in", () => {
    expect(stripMathDelimiters("$$x^2$$")).toBe("x^2")
    expect(stripMathDelimiters("\\(x\\)")).toBe("x")
    expect(stripMathDelimiters("$x$")).toBe("x")
  })
  it("recovers commands whose backslash JSON parsing turned into a control character", () => {
    // In JS (as after JSON.parse) "\f" and "\t" are a form feed and a tab - exactly the model's mistake.
    expect(repairJsonEscapes("\frac{F}{m} \times \text{N} \neq \rho \beta")).toBe("\\frac{F}{m} \\times \\text{N} \\neq \\rho \\beta")
    expect(renderLatex("\frac{1}{2}")).toContain("mfrac")
  })
  it("renders malformed LaTeX as visible error text instead of throwing", () => {
    expect(() => renderLatex("\\frac{1")).not.toThrow()
  })
  it("refuses commands that would emit links or raw HTML", () => {
    const html = renderLatex("\\href{javascript:alert(1)}{x} \\htmlClass{evil}{y}")
    expect(html).not.toContain("javascript:")
    expect(html).not.toContain('class="evil"')
  })
})

describe("renderMixed", () => {
  it("escapes prose and typesets only the delimited maths", () => {
    const html = renderMixed("If <b>m</b> doubles, $a = \\frac{F}{m}$ halves")
    expect(html).toContain("&lt;b&gt;m&lt;/b&gt;")
    expect(html).toContain("mfrac")
    expect(html).not.toContain("$")
  })
  it("still tidies prose that has no delimiters", () => {
    expect(renderMixed("a = 9.8 m/s^2")).toBe("a = 9.8 m/s²")
  })
  it("typesets LaTeX written without $ delimiters, e.g. a diagram label", () => {
    expect(looksLikeBareLatex("F_{\\text{pull}} = 8.8\\text{N}")).toBe(true)
    expect(looksLikeBareLatex("Weight (mg)")).toBe(false)
    const html = renderMixed("F_{\\text{pull}} = 8.8\\text{N}")
    expect(html).toContain("katex")
    expect(html).not.toContain("\\text")
    expect(html).not.toContain("_{")
  })
  it("wraps only the LaTeX in a line, leaving the words as ordinary text", () => {
    expect(delimitBareLatex("Pull force F_{\\text{p}} on the toy")).toBe("Pull force $F_{\\text{p}}$ on the toy")
    expect(delimitBareLatex("so F_{\\text{net}} = 66 N here")).toBe("so $F_{\\text{net}} = 66$ N here")
  })
  it("keeps **bold** headings and spacing when a line has bare LaTeX in it", () => {
    // What went wrong on the board: the whole line was typeset as maths - italic, spaces gone, literal ∗∗.
    const line = "**Question 2** - I: Pressure increases \\rightarrow faster rate"
    expect(delimitBareLatex(line)).toBe("**Question 2** - I: Pressure increases $\\rightarrow$ faster rate")
    const html = renderMixed(line)
    expect(html).toMatch(/^<strong>Question 2<\/strong> - I: Pressure increases <span class="katex">/)
    expect(html).toContain("faster rate")
  })
  it("bolds **headings** without letting any other markup through", () => {
    expect(renderMixed("**Part (a):** use $x$")).toMatch(/^<strong>Part \(a\):<\/strong> use <span class="katex">/)
    expect(renderMixed("**<img src=x>**")).toBe("<strong>&lt;img src=x&gt;</strong>")
  })
  it("bolds a heading that has maths inside it, instead of showing the ** markers", () => {
    // Bug report: "**Analyzing $y = 1 + \cos x$**" came out with literal asterisks either side.
    const html = renderMixed("**Analyzing $y = 1 + \\cos x$**\n- Period: $2\\pi$")
    expect(html).not.toContain("**")
    expect(html).toMatch(/^<strong>Analyzing <span class="katex">.*<\/span><\/strong><br>- Period: /)
  })
  it("leaves an unpaired ** as text", () => {
    expect(renderMixed("**Note $x$ here")).toMatch(/^\*\*Note <span class="katex">/)
  })
  it("leaves a lone dollar sign as text", () => {
    expect(renderMixed("costs $5")).toBe("costs $5")
  })
})

describe("hasInlineMath / mathSourceSummary", () => {
  it("detects delimited maths only", () => {
    expect(hasInlineMath("so $x = 2$")).toBe(true)
    expect(hasInlineMath("costs $5")).toBe(false)
  })
  it("drops the delimiters for plain-text summaries", () => {
    expect(mathSourceSummary("so $x^2$ grows")).toBe("so x^2 grows")
  })
})
