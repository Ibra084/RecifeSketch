/**
 * Normalizes common LaTeX-style math commands into plain Unicode symbols.
 *
 * `write_equation`/`write_text` render their string as plain rich text -
 * there is no LaTeX/markup interpreter anywhere in this app (consistent
 * with never executing arbitrary model output). The prompt asks the
 * model for plain notation, but models sometimes slip into LaTeX habits
 * (`\times` instead of `×`) anyway; this is the safety net so a slip
 * shows up as a readable symbol instead of a literal backslash-escape.
 */

const REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\\times/g, "×"],
  [/\\cdot/g, "·"],
  [/\\div/g, "÷"],
  [/\\pm/g, "±"],
  [/\\mp/g, "∓"],
  [/\\leq/g, "≤"],
  [/\\geq/g, "≥"],
  [/\\neq/g, "≠"],
  [/\\approx/g, "≈"],
  [/\\infty/g, "∞"],
  [/\\sqrt/g, "√"],
  [/\\sum/g, "Σ"],
  [/\\circ/g, "°"],
  [/\\Delta/g, "Δ"],
  [/\\pi/g, "π"],
  [/\\theta/g, "θ"],
  [/\\alpha/g, "α"],
  [/\\beta/g, "β"],
  [/\\gamma/g, "γ"],
  [/\\lambda/g, "λ"],
  [/\\mu/g, "μ"],
  [/\\omega/g, "ω"],
]

export function sanitizeMathNotation(expression: string): string {
  let result = expression
  for (const [pattern, replacement] of REPLACEMENTS) {
    result = result.replace(pattern, replacement)
  }
  return result
}
