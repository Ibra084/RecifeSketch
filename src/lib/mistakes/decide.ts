import { checkSteps, normaliseMath, parseExpression, toLatex } from "./math-check"
import { markPractice, type PracticeQuestion } from "./practice"
import type { CheckWorkModelOutput, CheckWorkResult, MistakeDraft } from "./schema"

/**
 * Combines what the AI read with what the maths checker found. The checker
 * decides right or wrong; the AI's words are only used where it agrees with
 * the checker. Anything unclear becomes an honest "I'm not sure", never a
 * made-up correction.
 */

const UNREADABLE = "I can't read this clearly enough to check it. Try writing a little larger, one step per line."
const UNSUPPORTED = "I can only check expanding brackets, simplifying and linear equations so far - so I won't guess at this one."

/** Typeset as maths if it is purely maths (e.g. "3(x + 2) = 3x + 6"); sentences stay as plain text. */
const math = (text: string) => (normaliseMath(text).split("=").every((part) => parseExpression(part) !== null) ? `$${toLatex(text)}$` : text)

export function decideCheck(
  model: CheckWorkModelOutput,
  options: { practice?: PracticeQuestion; sourceBoardId: string | null }
): CheckWorkResult {
  if (!model.readable || model.steps.length === 0) return { verdict: "uncertain", headline: UNREADABLE }
  if (model.confidence === "low") {
    return { verdict: "uncertain", headline: "I'm not sure I've read your working correctly, so I won't mark it. Could you rewrite it more clearly?" }
  }
  const steps = model.steps.map((s) => s.text)
  const boxOf = (i: number) => model.steps[Math.min(i, model.steps.length - 1)]?.box

  if (options.practice) {
    const outcome = markPractice(options.practice, steps)
    if (outcome.result === "correct") {
      return { verdict: "correct", headline: `That's right - ${math(options.practice.answer)}. Nicely done.`, box: boxOf(steps.length - 1), practice: "correct" }
    }
    if (outcome.result === "unfinished") return { verdict: "unfinished", headline: outcome.detail, box: boxOf(steps.length - 1), practice: "unfinished" }
    if (outcome.result === "unverified") return { verdict: "uncertain", headline: `I can't check this one reliably: ${outcome.detail}`, practice: "unverified" }
    const check = checkSteps(options.practice.skill, steps)
    const at = check.status === "error" ? check.stepIndex : model.errorStep ?? steps.length - 1
    return {
      verdict: "mistake",
      headline: "Not quite - have another look at this step.",
      hint: model.errorStep === at && model.hint ? model.hint : outcome.detail,
      box: boxOf(at),
      practice: "incorrect",
    }
  }

  if (model.skill === "other") return { verdict: "uncertain", headline: UNSUPPORTED }
  const check = checkSteps(model.skill, steps)
  if (check.status === "unsupported") return { verdict: "uncertain", headline: `I can't check this reliably: ${check.reason}` }
  if (check.status === "correct") {
    if (check.unfinished) return { verdict: "unfinished", headline: check.unfinished, box: boxOf(steps.length - 1) }
    return { verdict: "correct", headline: "This is all correct - every step follows from the one before.", box: boxOf(steps.length - 1) }
  }

  // A real error, found by the checker. The AI's explanation is used only if it found the same step.
  const agreed = model.errorStep === check.stepIndex && model.misconception.length > 0 && model.hint.length > 0
  const draft: MistakeDraft | undefined = agreed && model.concept
    ? {
        subject: "maths",
        skill: model.skill,
        concept: model.concept,
        misconception: model.misconception,
        incorrectStep: check.previous === check.wrong ? check.wrong : `${check.previous} = ${check.wrong}`,
        correctRelationship: check.correctRelationship,
        hint: model.hint,
        sourceBoardId: options.sourceBoardId,
      }
    : undefined
  return {
    verdict: "mistake",
    headline: `This step isn't right: ${math(check.wrong)} doesn't follow from ${math(check.previous)}.`,
    hint: agreed ? model.hint : "Compare it with the step before - they should be equal, but they aren't. What changed?",
    correction: `${math(check.correctRelationship)}${agreed && model.explanation ? ` ${model.explanation}` : ""}`,
    box: boxOf(check.stepIndex),
    ...(draft ? { draft } : {}),
  }
}
