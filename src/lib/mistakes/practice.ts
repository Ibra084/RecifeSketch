import { checkSteps, expandedForm, normaliseMath, parseExpression, type Skill } from "./math-check"

/**
 * One practice question for a saved mistake: the same skill, new numbers.
 * Built from a small template per skill with random coefficients - no AI call,
 * no question bank - and its answer is worked out by the deterministic checker,
 * never guessed.
 */

export interface PracticeQuestion {
  skill: Skill
  /** What the student sees, e.g. "Expand 4(x + 3)". */
  prompt: string
  /** The expression or equation the working starts from, e.g. "4(x + 3)" or "2x + 5 = 17". */
  start: string
  /** The expected final answer, e.g. "4x + 12" or "x = 6". */
  answer: string
}

type Rng = () => number

const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1))
const pick = <T,>(rng: Rng, items: readonly T[]) => items[Math.floor(rng() * items.length)]
const signed = (n: number) => (n < 0 ? `- ${-n}` : `+ ${n}`)

/** Numbers appearing in the original mistake, so the new question doesn't just repeat them. */
function numbersIn(text: string): Set<number> {
  return new Set((text.match(/\d+/g) ?? []).map(Number))
}

function generateOnce(skill: Skill, rng: Rng): PracticeQuestion {
  const variable = pick(rng, ["x", "x", "y", "a", "n"])
  if (skill === "expand_brackets") {
    const a = int(rng, 2, 9) * (rng() < 0.25 ? -1 : 1)
    const b = int(rng, 1, 9) * (rng() < 0.4 ? -1 : 1)
    const start = `${a}(${variable} ${signed(b)})`
    return { skill, prompt: `Expand ${start}`, start, answer: expandedForm(parseExpression(start)!)! }
  }
  if (skill === "simplify_expression") {
    const p = int(rng, 2, 9), q = int(rng, 1, 9), r = int(rng, 1, 6), s = int(rng, 1, 9)
    const start = `${p}${variable} ${signed(q)} ${rng() < 0.5 ? "+" : "-"} ${r}${variable} ${signed(-s)}`
    return { skill, prompt: `Simplify ${start}`, start, answer: expandedForm(parseExpression(start)!)! }
  }
  // Linear equation with a whole-number solution: either ax + b = c or a(x + b) = c.
  const solution = int(rng, -6, 9)
  const a = int(rng, 2, 7)
  const b = int(rng, 1, 9) * (rng() < 0.3 ? -1 : 1)
  const bracketed = rng() < 0.4
  const lhs = bracketed ? `${a}(${variable} ${signed(b)})` : `${a}${variable} ${signed(b)}`
  const c = bracketed ? a * (solution + b) : a * solution + b
  const start = `${lhs} = ${c}`
  return { skill, prompt: `Solve ${start}`, start, answer: `${variable} = ${solution}` }
}

/**
 * A practice question for `skill` that differs from the original mistake
 * (`original` is the student's incorrect step - its numbers are avoided).
 */
export function generatePractice(skill: Skill, original: string, rng: Rng = Math.random): PracticeQuestion {
  const avoid = numbersIn(original)
  let question = generateOnce(skill, rng)
  for (let tries = 0; tries < 20; tries++) {
    const overlap = [...numbersIn(question.start)].filter((n) => avoid.has(n) && n > 1).length
    if (overlap === 0 && normaliseMath(question.start) !== normaliseMath(original)) break
    question = generateOnce(skill, rng)
  }
  return question
}

export type PracticeOutcome =
  | { result: "correct" }
  | { result: "incorrect"; detail: string }
  | { result: "unfinished"; detail: string }
  | { result: "unverified"; detail: string }

/**
 * Marks a practice attempt deterministically: the working must follow from
 * the question step by step, and end at the expected answer. The question's
 * start is prepended if the student didn't copy it out.
 */
export function markPractice(question: PracticeQuestion, steps: readonly string[]): PracticeOutcome {
  if (steps.length === 0) return { result: "unverified", detail: "I couldn't find any working to check." }
  const startsWithQuestion = normaliseMath(steps[0]).replace(/\s/g, "").startsWith(normaliseMath(question.start).replace(/\s/g, ""))
  const working = startsWithQuestion ? steps : [question.skill === "solve_linear_equation" ? question.start : `${question.start} = ${steps[0]}`, ...steps.slice(1)]
  const check = checkSteps(question.skill, working)
  if (check.status === "unsupported") return { result: "unverified", detail: check.reason }
  if (check.status === "error") return { result: "incorrect", detail: `${check.wrong} doesn't follow from ${check.previous}.` }
  if (check.unfinished) return { result: "unfinished", detail: check.unfinished }
  return { result: "correct" }
}
