/**
 * Turns the maths a model (or person) naturally writes into the LaTeX that
 * Desmos accepts. Desmos rejects plain-text function names ("sin(x)" reads
 * as s*i*n*x), bare |x| bars, "sqrt(x)", "pi" and "x^(1/2)" - so every graph
 * expression goes through here before it reaches the calculator. Text that
 * is already proper LaTeX passes through unchanged.
 */

import { convertAbsBars } from "./abs-bars"
import { repairJsonEscapes, stripMathDelimiters } from "./math-render"

// Longest names first, so "sinh" isn't read as "sin" + "h".
const FUNCTION_NAMES = ["arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "sin", "cos", "tan", "sec", "csc", "cot", "ln", "log", "exp"]
const GREEK = ["theta", "alpha", "beta", "pi"]

/** Index just past the bracket matching the one at `start` (which must be "(" or "{"), or -1. */
function matchingBracket(text: string, start: number): number {
  const openCh = text[start]
  const closeCh = openCh === "(" ? ")" : "}"
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === openCh) depth++
    else if (text[i] === closeCh && --depth === 0) return i + 1
  }
  return -1
}

/** Rewrites every `name(...)` as `prefix{...}` (e.g. sqrt(x) -> \sqrt{x}), or `^(...)` as `^{...}`. */
function parenthesesToBraces(text: string, pattern: RegExp, replacement: string): string {
  let out = ""
  let rest = text
  for (let match = pattern.exec(rest); match; match = pattern.exec(rest)) {
    const parenAt = match.index + match[0].length - 1
    const end = matchingBracket(rest, parenAt)
    if (end < 0) break
    out += rest.slice(0, match.index) + replacement + "{" + toDesmosLatexInner(rest.slice(parenAt + 1, end - 1)) + "}"
    rest = rest.slice(end)
  }
  return out + rest
}

const TRIG_INVERSES = new Set(["sin", "cos", "tan"])

/**
 * `\sin^3(x)` -> `\left(\sin(x)\right)^{3}` and `\sin^{-1} x` -> `\arcsin(x)`: Desmos rejects a power
 * written on a function's name ("sin3 is not supported, otherwise use parens"). The argument is a
 * bracketed group, or a single number/letter/command written without brackets ("\cos^2 x").
 */
function powersOffFunctionNames(text: string): string {
  const pattern = new RegExp(`\\\\(${FUNCTION_NAMES.join("|")})\\s*\\^\\s*(\\{\\s*-?\\s*[0-9]+\\s*\\}|-?[0-9])\\s*`)
  let out = ""
  let rest = text
  for (let match = pattern.exec(rest); match; match = pattern.exec(rest)) {
    const [whole, name, rawPower] = match
    const power = rawPower.replace(/[{}\s]/g, "")
    const argAt = match.index + whole.length
    let argEnd: number
    let arg: string
    if (rest.startsWith("\\left(", argAt)) {
      const close = rest.indexOf("\\right)", argAt)
      if (close < 0) break
      argEnd = close + "\\right)".length
      arg = rest.slice(argAt + "\\left(".length, close)
    } else if (rest[argAt] === "(" || rest[argAt] === "{") {
      argEnd = matchingBracket(rest, argAt)
      if (argEnd < 0) break
      arg = rest.slice(argAt + 1, argEnd - 1)
    } else {
      const token = /^(\\[a-zA-Z]+|[0-9.]*[a-zA-Z]|[0-9.]+)/.exec(rest.slice(argAt))
      if (!token) break
      argEnd = argAt + token[0].length
      arg = token[0]
    }
    const call = power === "-1" && TRIG_INVERSES.has(name)
      ? `\\arc${name}(${arg})`
      : `\\left(\\${name}(${arg})\\right)^{${power}}`
    out += rest.slice(0, match.index) + call
    rest = rest.slice(argEnd)
  }
  return out + rest
}

function toDesmosLatexInner(text: string): string {
  let latex = text
  latex = parenthesesToBraces(latex, /(?<![\\a-zA-Z])sqrt\s*\(|\\sqrt\(/, "\\sqrt")
  latex = parenthesesToBraces(latex, /\^\(/, "^")
  latex = latex.replace(/(?<![\\a-zA-Z])abs\s*\(/g, "\\operatorname{abs}(")
  for (const name of FUNCTION_NAMES) {
    latex = latex.replace(new RegExp(`(?<![\\\\a-zA-Z])${name}(?![a-zA-Z])`, "g"), `\\${name}`)
  }
  for (const name of GREEK) {
    latex = latex.replace(new RegExp(`(?<![\\\\a-zA-Z])${name}(?![a-zA-Z])`, "g"), `\\${name}`)
  }
  return powersOffFunctionNames(latex).replace(/<=/g, "\\le ").replace(/>=/g, "\\ge ")
}

export function toDesmosLatex(expression: string): string {
  const latex = stripMathDelimiters(repairJsonEscapes(expression.trim()))
  // Bars that are already \left| ... \right| stay as they are; bare ones get paired up.
  const marked = latex.replace(/\\left\|/g, "\u0001").replace(/\\right\|/g, "\u0002")
  const paired = marked.includes("|") ? convertAbsBars(marked, "\u0001", "\u0002") : marked
  return toDesmosLatexInner(paired).replace(/\u0001/g, "\\left|").replace(/\u0002/g, "\\right|")
}
