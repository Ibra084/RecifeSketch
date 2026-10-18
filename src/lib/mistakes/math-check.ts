import { create, all, type MathNode } from "mathjs"

/**
 * Deterministic checking of a student's working - the part of Mistake Memory
 * that decides what is mathematically right or wrong. The AI only reads the
 * handwriting and explains; it never gets the final say on correctness.
 *
 * Supported (MVP): expanding brackets, simplifying expressions, and solving
 * linear equations in one variable. Anything else is reported as unsupported,
 * never guessed at.
 *
 * Safety: expressions are parsed with mathjs and only a small whitelist of
 * node types is accepted (numbers, single-letter variables, + - * / ^,
 * brackets). Nothing is ever executed as code.
 */

const math = create(all)

export type Skill = "expand_brackets" | "simplify_expression" | "solve_linear_equation"
export const SKILLS: readonly Skill[] = ["expand_brackets", "simplify_expression", "solve_linear_equation"]

export type StepCheck =
  | { status: "correct"; /** For expand/simplify: the final answer still has brackets or isn't fully simplified. */ unfinished?: string }
  | {
      status: "error"
      /** Index into the student's steps of the first step that doesn't follow. */
      stepIndex: number
      /** The last correct expression/equation before it, and the wrong one, as written. */
      previous: string
      wrong: string
      /** What the wrong step should have been, e.g. "3(x + 2) = 3x + 6". */
      correctRelationship: string
    }
  | { status: "unsupported"; reason: string }

// ─── Parsing ────────────────────────────────────────────────────────────────

const ALLOWED_OPERATORS = new Set(["add", "subtract", "multiply", "divide", "pow", "unaryMinus", "unaryPlus"])

/** Normalises the ways maths gets written (×, ÷, −, ², implicit spacing) into mathjs syntax. */
export function normaliseMath(text: string): string {
  return text
    .replace(/[−–—]/g, "-")
    .replace(/[×·∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/\s+/g, " ")
    .trim()
}

/** A safely-parsed expression, or null if it isn't plain algebra (functions, assignments, units... are refused). */
export function parseExpression(text: string): MathNode | null {
  const source = normaliseMath(text)
  if (!source || source.length > 160 || /[=<>!;:,[\]{}'"`]/.test(source)) return null
  let node: MathNode
  try {
    node = math.parse(source)
  } catch {
    return null
  }
  let ok = true
  node.traverse((n) => {
    if (!ok) return
    if (n.type === "ConstantNode") {
      if (typeof (n as unknown as { value: unknown }).value !== "number") ok = false
    } else if (n.type === "SymbolNode") {
      const name = (n as unknown as { name: string }).name
      if (!/^[a-z]$/i.test(name)) ok = false
    } else if (n.type === "OperatorNode") {
      if (!ALLOWED_OPERATORS.has((n as unknown as { fn: string }).fn)) ok = false
    } else if (n.type !== "ParenthesisNode") {
      ok = false
    }
  })
  return ok ? node : null
}

function variablesOf(node: MathNode): Set<string> {
  const vars = new Set<string>()
  node.traverse((n) => {
    if (n.type === "SymbolNode") vars.add((n as unknown as { name: string }).name)
  })
  return vars
}

function evaluate(node: MathNode, scope: Record<string, number>): number {
  const value = node.compile().evaluate(scope) as unknown
  return typeof value === "number" ? value : NaN
}

// Fixed, "awkward" sample points: deterministic, and very unlikely to make different expressions agree.
const SAMPLES = [1.371, -2.113, 0.537, 3.719, -0.291, 5.03]

function close(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b))
}

/** True if two expressions are equal for every value of their variables (checked at several sample points). */
export function equivalent(a: MathNode, b: MathNode): boolean {
  const vars = [...new Set([...variablesOf(a), ...variablesOf(b)])]
  return SAMPLES.every((_, i) => {
    // Each variable gets its own value at each sample, so x and y are never accidentally equal.
    const scope = Object.fromEntries(vars.map((v, j) => [v, SAMPLES[(i + j) % SAMPLES.length] + j * 0.173]))
    return close(evaluate(a, scope), evaluate(b, scope))
  })
}

/** Expanded, collected form of a one-variable polynomial, written the way a student would ("3x + 6"). */
export function expandedForm(node: MathNode): string | null {
  try {
    const vars = [...variablesOf(node)]
    if (vars.length > 1) return null
    const expanded = vars.length === 0 ? math.simplify(node) : math.rationalize(node)
    return tidy(expanded.toString())
  } catch {
    return null
  }
}

/** mathjs output in student style: "3 * x + 6" -> "3x + 6", "x ^ 2" -> "x^2". */
export function tidy(text: string): string {
  return text
    .replace(/(\d)\s*\*\s*([a-z(])/gi, "$1$2")
    .replace(/\)\s*\*\s*\(/g, ")(")
    .replace(/\s*\^\s*/g, "^")
    .replace(/\+\s*-\s*/g, "- ")
    .replace(/\s+/g, " ")
    .trim()
}

function hasBrackets(text: string): boolean {
  return /[()]/.test(normaliseMath(text))
}

// ─── Expand / simplify: a chain of equivalent expressions ───────────────────

/**
 * The student's steps as one chain of expressions: "3(x + 2) = 3x + 6" and a
 * new line "= 3x + 6" both continue the chain. Each expression remembers the
 * step it came from.
 */
function expressionChain(steps: readonly string[]): { text: string; step: number }[] | null {
  const chain: { text: string; step: number }[] = []
  steps.forEach((step, index) => {
    for (const part of normaliseMath(step).split("=")) {
      const text = part.trim()
      if (text) chain.push({ text, step: index })
    }
  })
  return chain.length > 0 ? chain : null
}

function checkRewriting(skill: "expand_brackets" | "simplify_expression", steps: readonly string[]): StepCheck {
  const chain = expressionChain(steps)
  if (!chain || chain.length < 2) return { status: "unsupported", reason: "There's only one expression - nothing to compare it with." }
  const nodes = chain.map((c) => parseExpression(c.text))
  const unreadable = nodes.findIndex((n) => n === null)
  if (unreadable >= 0) return { status: "unsupported", reason: `"${chain[unreadable].text}" isn't something I can check yet.` }
  const vars = new Set(nodes.flatMap((n) => [...variablesOf(n!)]))
  if (vars.size > 2) return { status: "unsupported", reason: "That uses more variables than I can check yet." }

  for (let i = 1; i < chain.length; i++) {
    if (!equivalent(nodes[i - 1]!, nodes[i]!)) {
      const correct = expandedForm(nodes[i - 1]!)
      return {
        status: "error",
        stepIndex: chain[i].step,
        previous: chain[i - 1].text,
        wrong: chain[i].text,
        correctRelationship: correct ? `${chain[i - 1].text} = ${correct}` : `${chain[i - 1].text} is not equal to ${chain[i].text}`,
      }
    }
  }
  const final = chain[chain.length - 1]
  if (skill === "expand_brackets" && hasBrackets(final.text)) {
    return { status: "correct", unfinished: "Everything so far is right, but there are still brackets to expand." }
  }
  const tidyFinal = expandedForm(nodes[nodes.length - 1]!)
  if (skill === "simplify_expression" && tidyFinal && normaliseMath(tidyFinal).replace(/\s/g, "").length < normaliseMath(final.text).replace(/\s/g, "").length - 1) {
    return { status: "correct", unfinished: "Everything so far is right, but it can be simplified further." }
  }
  return { status: "correct" }
}

// ─── Linear equations: every step must keep the same solution ───────────────

type SolutionSet = { kind: "one"; value: number } | { kind: "all" } | { kind: "none" }

function solutionSet(equation: string): { variable: string | null; set: SolutionSet } | null {
  const sides = normaliseMath(equation).split("=")
  if (sides.length !== 2) return null
  const lhs = parseExpression(sides[0])
  const rhs = parseExpression(sides[1])
  if (!lhs || !rhs) return null
  const vars = [...new Set([...variablesOf(lhs), ...variablesOf(rhs)])]
  if (vars.length > 1) return null
  const variable = vars[0] ?? null
  const f = (x: number) => evaluate(lhs, variable ? { [variable]: x } : {}) - evaluate(rhs, variable ? { [variable]: x } : {})
  const b = f(0)
  const a = f(1) - b
  // Must be linear: check a few more points lie on the same line.
  if (![2, -3, 0.5].every((x) => close(f(x), a * x + b))) return null
  if (close(a, 0)) return { variable, set: close(b, 0) ? { kind: "all" } : { kind: "none" } }
  return { variable, set: { kind: "one", value: -b / a } }
}

function sameSet(a: SolutionSet, b: SolutionSet): boolean {
  if (a.kind !== b.kind) return false
  return a.kind !== "one" || close(a.value, (b as { value: number }).value)
}

function describe(variable: string, set: SolutionSet): string {
  if (set.kind === "all") return "true for every value"
  if (set.kind === "none") return "never true"
  const v = Math.round(set.value * 1e6) / 1e6
  return `${variable} = ${v}`
}

function checkEquationSteps(steps: readonly string[]): StepCheck {
  const equations = steps.map((s) => normaliseMath(s)).filter((s) => s.length > 0)
  if (equations.length === 0) return { status: "unsupported", reason: "There's no working to check." }
  const sets = equations.map(solutionSet)
  const bad = sets.findIndex((s) => s === null)
  if (bad >= 0) return { status: "unsupported", reason: `"${equations[bad]}" isn't a linear equation in one variable I can check.` }
  const variable = sets.find((s) => s!.variable)?.variable ?? "x"
  for (let i = 1; i < sets.length; i++) {
    if (!sameSet(sets[i - 1]!.set, sets[i]!.set)) {
      return {
        status: "error",
        stepIndex: i,
        previous: equations[i - 1],
        wrong: equations[i],
        correctRelationship: `${equations[i - 1]} means ${describe(variable, sets[i - 1]!.set)}, but ${equations[i]} means ${describe(variable, sets[i]!.set)}`,
      }
    }
  }
  const last = equations[equations.length - 1]
  if (!new RegExp(`^${variable}\\s*=\\s*-?[\\d.]+(\\s*/\\s*\\d+)?$|^-?[\\d.]+(\\s*/\\s*\\d+)?\\s*=\\s*${variable}$`).test(last.replace(/\s+/g, " "))) {
    return { status: "correct", unfinished: `Every step is right so far - keep going until you have ${variable} on its own.` }
  }
  return { status: "correct" }
}

/** Checks a student's steps for the given skill. */
export function checkSteps(skill: Skill, steps: readonly string[]): StepCheck {
  if (steps.length === 0) return { status: "unsupported", reason: "There's no working to check." }
  return skill === "solve_linear_equation" ? checkEquationSteps(steps) : checkRewriting(skill, steps)
}

/** Writes an expression/equation as LaTeX for display (falls back to the plain text). */
export function toLatex(text: string): string {
  const parts = normaliseMath(text).split("=")
  const tex = parts.map((p) => {
    const node = parseExpression(p)
    // mathjs marks hidden multiplication with "~" (a visible space in KaTeX): "3~ x" should read "3x".
    return node ? node.toTex({ implicit: "hide", parenthesis: "keep" }).replace(/~\s*/g, "").replace(/\\left\(\s*/g, "(").replace(/\s*\\right\)/g, ")") : p.trim()
  })
  return tex.join(" = ")
}
