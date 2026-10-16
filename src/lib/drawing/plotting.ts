/**
 * Mathematical plotting utilities.
 *
 * Deterministic, side-effect-free math: a hand-rolled tokenizer + recursive
 * descent parser + tree-walking evaluator for a small, fixed expression
 * grammar in one variable (`x`). There is no `eval`, no `Function`
 * constructor, and no arbitrary code execution anywhere in this module -
 * every expression is interpreted against a closed set of operators,
 * functions and constants.
 */

import type { Point } from "./protocol"
import { convertAbsBars } from "./abs-bars"

// ─── Tokenizer ───────────────────────────────────────────────────────────

type Token =
  | { kind: "number"; value: number }
  | { kind: "identifier"; name: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "^" | "%" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" }

function tokenize(source: string): Token[] {
  // |x - 2| is how absolute value is usually written; the grammar knows it as abs(x - 2).
  const expression = source.includes("|") ? convertAbsBars(source, "abs(", ")") : source
  const tokens: Token[] = []
  let i = 0

  while (i < expression.length) {
    const char = expression[i]

    if (/\s/.test(char)) {
      i++
      continue
    }

    if (/[0-9.]/.test(char)) {
      let j = i + 1
      while (j < expression.length && /[0-9.]/.test(expression[j])) j++
      const text = expression.slice(i, j)
      const value = Number(text)
      if (Number.isNaN(value)) {
        throw new Error(`Invalid number literal "${text}" in expression`)
      }
      tokens.push({ kind: "number", value })
      i = j
      continue
    }

    if (/[A-Za-z_]/.test(char)) {
      let j = i + 1
      while (j < expression.length && /[A-Za-z0-9_]/.test(expression[j])) j++
      tokens.push({ kind: "identifier", name: expression.slice(i, j) })
      i = j
      continue
    }

    if (char === "(") {
      tokens.push({ kind: "lparen" })
      i++
      continue
    }
    if (char === ")") {
      tokens.push({ kind: "rparen" })
      i++
      continue
    }
    if (char === ",") {
      tokens.push({ kind: "comma" })
      i++
      continue
    }
    if (char === "+" || char === "-" || char === "*" || char === "/" || char === "^" || char === "%") {
      tokens.push({ kind: "op", value: char })
      i++
      continue
    }

    throw new Error(`Unexpected character "${char}" in expression`)
  }

  return tokens
}

// ─── AST ─────────────────────────────────────────────────────────────────

type AstNode =
  | { kind: "number"; value: number }
  | { kind: "variable" }
  | { kind: "constant"; name: "pi" | "e" }
  | { kind: "call"; name: string; args: AstNode[] }
  | { kind: "unary"; op: "-"; operand: AstNode }
  | { kind: "binary"; op: "+" | "-" | "*" | "/" | "^" | "%"; left: AstNode; right: AstNode }

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E }

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  log: Math.log,
  log10: Math.log10,
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
}

/** Recursive-descent parser for: `expr := term (('+'|'-') term)*`. */
class ExpressionParser {
  private pos = 0

  constructor(private readonly tokens: Token[]) {}

  parse(): AstNode {
    if (this.tokens.length === 0) {
      throw new Error("Cannot parse an empty expression")
    }
    const node = this.parseAddSub()
    if (this.pos < this.tokens.length) {
      throw new Error("Unexpected trailing tokens in expression")
    }
    return node
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private next(): Token {
    const token = this.tokens[this.pos]
    if (!token) throw new Error("Unexpected end of expression")
    this.pos++
    return token
  }

  private parseAddSub(): AstNode {
    let node = this.parseMulDiv()
    for (;;) {
      const token = this.peek()
      if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
        this.next()
        const right = this.parseMulDiv()
        node = { kind: "binary", op: token.value, left: node, right }
      } else {
        return node
      }
    }
  }

  private parseMulDiv(): AstNode {
    let node = this.parseUnary()
    for (;;) {
      const token = this.peek()
      if (token?.kind === "op" && (token.value === "*" || token.value === "/" || token.value === "%")) {
        this.next()
        const right = this.parseUnary()
        node = { kind: "binary", op: token.value, left: node, right }
      } else {
        return node
      }
    }
  }

  private parseUnary(): AstNode {
    const token = this.peek()
    if (token?.kind === "op" && token.value === "-") {
      this.next()
      return { kind: "unary", op: "-", operand: this.parseUnary() }
    }
    return this.parsePow()
  }

  private parsePow(): AstNode {
    const base = this.parsePrimary()
    const token = this.peek()
    if (token?.kind === "op" && token.value === "^") {
      this.next()
      // Right-associative: 2^3^2 === 2^(3^2)
      const exponent = this.parseUnary()
      return { kind: "binary", op: "^", left: base, right: exponent }
    }
    return base
  }

  private parsePrimary(): AstNode {
    const token = this.next()

    if (token.kind === "number") return { kind: "number", value: token.value }

    if (token.kind === "lparen") {
      const node = this.parseAddSub()
      const closing = this.next()
      if (closing.kind !== "rparen") throw new Error("Expected closing parenthesis")
      return node
    }

    if (token.kind === "identifier") {
      if (this.peek()?.kind === "lparen") {
        this.next()
        const args: AstNode[] = []
        if (this.peek()?.kind !== "rparen") {
          args.push(this.parseAddSub())
          while (this.peek()?.kind === "comma") {
            this.next()
            args.push(this.parseAddSub())
          }
        }
        const closing = this.next()
        if (closing.kind !== "rparen") throw new Error("Expected closing parenthesis")

        if (!(token.name in FUNCTIONS)) {
          throw new Error(`Unknown function "${token.name}" in expression`)
        }
        return { kind: "call", name: token.name, args }
      }

      if (token.name === "x") return { kind: "variable" }
      if (token.name in CONSTANTS) return { kind: "constant", name: token.name as "pi" | "e" }

      throw new Error(`Unknown identifier "${token.name}" in expression`)
    }

    throw new Error("Unexpected token in expression")
  }
}

function evaluateAst(node: AstNode, x: number): number {
  switch (node.kind) {
    case "number":
      return node.value
    case "variable":
      return x
    case "constant":
      return CONSTANTS[node.name]
    case "unary":
      return -evaluateAst(node.operand, x)
    case "call":
      return FUNCTIONS[node.name](...node.args.map((arg) => evaluateAst(arg, x)))
    case "binary": {
      const left = evaluateAst(node.left, x)
      const right = evaluateAst(node.right, x)
      switch (node.op) {
        case "+":
          return left + right
        case "-":
          return left - right
        case "*":
          return left * right
        case "/":
          return left / right
        case "%":
          return left % right
        case "^":
          return left ** right
      }
    }
  }
}

/** Parses `expression` once and returns a reusable evaluator for it. */
export function compileExpression(expression: string): (x: number) => number {
  const ast = new ExpressionParser(tokenize(expression)).parse()
  return (x: number) => evaluateAst(ast, x)
}

/** Parses and evaluates `expression` at a single `x`. Throws on invalid syntax. */
export function evaluateExpression(expression: string, x: number): number {
  return compileExpression(expression)(x)
}

// ─── Sampling & coordinate mapping ─────────────────────────────────────────

export interface MathPoint {
  x: number
  y: number
}

/**
 * Samples `expression` at `samples` evenly spaced points across `domain`,
 * dropping any sample whose result is not finite (e.g. a pole in `1/x`) so
 * the rest of the curve can still be drawn. Throws if the expression is
 * invalid, or if no sample in the domain produced a finite value.
 */
export function sampleFunction(
  expression: string,
  domain: readonly [number, number],
  samples: number
): MathPoint[] {
  const [min, max] = domain
  const evaluate = compileExpression(expression)
  const points: MathPoint[] = []

  for (let i = 0; i < samples; i++) {
    const x = samples === 1 ? min : min + ((max - min) * i) / (samples - 1)
    const y = evaluate(x)
    if (Number.isFinite(y)) points.push({ x, y })
  }

  if (points.length === 0) {
    throw new Error(
      `Expression "${expression}" did not produce any finite value over the domain [${min}, ${max}]`
    )
  }

  return points
}

/** Transforms math-space points into canvas-space, flipping the y axis. */
export function mapPointsToCanvas(
  points: readonly MathPoint[],
  options: { position: Point; scale: Point }
): Point[] {
  const { position, scale } = options
  return points.map((point) => ({
    x: position.x + point.x * scale.x,
    y: position.y - point.y * scale.y,
  }))
}

/**
 * Picks a round, evenly-spaced set of axis tick values spanning `[min, max]`
 * - the classic "nice numbers" approach (step sizes of 1/2/5 x a power of
 * ten), so an axis reads "1, 2, 3" or "0, 20, 40", never "0, 17.3, 34.6".
 * Always includes 0 when the range straddles it, since that's where the
 * axes themselves cross and a reader needs that tick labelled.
 */
export function computeNiceTicks(min: number, max: number, targetCount = 5): number[] {
  if (min === max) return [min]

  const span = max - min
  const rawStep = span / Math.max(1, targetCount)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalized = rawStep / magnitude

  let niceStep: number
  if (normalized < 1.5) niceStep = 1
  else if (normalized < 3) niceStep = 2
  else if (normalized < 7) niceStep = 5
  else niceStep = 10
  const step = niceStep * magnitude

  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const round = (value: number) => Number(value.toFixed(Math.min(decimals + 2, 10)))

  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let value = start; value <= max + step * 1e-9; value += step) {
    ticks.push(round(value))
  }

  if (min <= 0 && max >= 0 && !ticks.includes(0)) {
    ticks.push(0)
    ticks.sort((a, b) => a - b)
  }

  return ticks
}
