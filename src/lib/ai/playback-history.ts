import type { TeachingPlan } from "./teaching-protocol"
import type { PlaybackSnapshot } from "../drawing/playback/types"

/** Mirrors MAX_HISTORY_EXPLANATION_LENGTH in context.ts. */
const MAX_EXPLANATION_LENGTH = 1600

/**
 * What the student was actually shown, for the tutor to remember in
 * follow-ups: every completed step's explanation, numbered. Steps that
 * never got drawn (playback stopped or failed first) are left out, so a
 * follow-up never assumes the student saw them.
 */
export function playbackExplanation(plan: TeachingPlan, outcome: PlaybackSnapshot): string {
  let drawn = 0
  const shown: string[] = []
  for (const [index, step] of plan.steps.entries()) {
    drawn += step.actions.length
    if (outcome.state !== "completed" && drawn > outcome.actionIndex) break
    shown.push(`${index + 1}. ${step.commentary}`)
  }
  const total = plan.steps.length
  const status =
    outcome.state === "completed" ? ""
      : shown.length === 0 ? "No complete teaching step was drawn. "
      : `${outcome.state === "cancelled" ? "Stopped" : "Drawing failed"} after step ${shown.length} of ${total}; later steps were not shown. `
  return (status + shown.join(" ")).trim().slice(0, MAX_EXPLANATION_LENGTH)
}
