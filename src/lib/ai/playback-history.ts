import type { TeachingPlan } from "./teaching-protocol"
import type { PlaybackSnapshot } from "../drawing/playback/types"

/** Only completed steps may be described as taught in a follow-up request. */
export function playbackCommentary(plan: TeachingPlan, outcome: PlaybackSnapshot): string {
  if (outcome.state === "completed") return plan.steps.at(-1)!.commentary
  let count = 0
  let last = "No complete teaching step was drawn."
  for (const step of plan.steps) {
    count += step.actions.length
    if (count > outcome.actionIndex) break
    last = step.commentary
  }
  const status = outcome.state === "cancelled" ? "Drawing cancelled; board may be partial. " : "Drawing failed; board may be partial. "
  return (status + "Last completed step: " + last).slice(0, 400)
}
