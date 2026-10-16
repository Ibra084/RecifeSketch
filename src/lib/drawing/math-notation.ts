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

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "-": "⁻", "+": "⁺", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ", y: "ʸ",
}

// Unicode only has subscripts for some letters; anything else stays as written.
const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "-": "₋", "+": "₊", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", h: "ₕ", i: "ᵢ", j: "ⱼ", k: "ₖ", l: "ₗ", m: "ₘ", n: "ₙ", o: "ₒ", p: "ₚ", r: "ᵣ", s: "ₛ", t: "ₜ", u: "ᵤ", v: "ᵥ", x: "ₓ",
}

/** Maps every character, or returns null if any has no Unicode form (so the original stays readable). */
function mapAll(text: string, table: Record<string, string>): string | null {
  const chars = [...text]
  return chars.every((ch) => ch in table) ? chars.map((ch) => table[ch]).join("") : null
}

/** `x^2`, `x^-1`, `x^{n+1}`, `e^(2x)`; `F_net`, `v_{0}`, `x_1` -> real super/subscripts where Unicode allows. */
function scripts(text: string): string {
  return text
    .replace(/\^\{([^{}]+)\}|\^\(([^()]+)\)|\^(-?[0-9]+|[nixy])\b/g, (whole, braced?: string, paren?: string, bare?: string) =>
      mapAll((braced ?? paren ?? bare)!, SUPERSCRIPT) ?? whole
    )
    .replace(/_\{([^{}]+)\}|_([0-9]+|[a-z]+)\b/gi, (whole, braced?: string, bare?: string) =>
      mapAll((braced ?? bare)!.toLowerCase(), SUBSCRIPT) ?? whole
    )
}

/** Plain-ASCII operators models type, as the symbols a textbook would print. */
const OPERATORS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\s*\*\s*/g, " × "],
  [/<=/g, "≤"],
  [/>=/g, "≥"],
  [/!=/g, "≠"],
  [/->/g, "→"],
  [/\+-/g, "±"],
  [/\bsqrt\(/g, "√("],
  [/(\d)\s*deg\b/g, "$1°"],
]

/** For prose display (the orb's speech): LaTeX slips become symbols, `^`/`_` become super/subscripts. */
export function toDisplayMath(text: string): string {
  return scripts(sanitizeMathNotation(text))
}

/** For equations written on the board: also turns typed operators (`*`, `<=`, `->`) into proper symbols. */
export function formatEquation(expression: string): string {
  let result = sanitizeMathNotation(expression)
  for (const [pattern, replacement] of OPERATORS) result = result.replace(pattern, replacement)
  return scripts(result)
}
