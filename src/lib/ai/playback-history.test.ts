import { expect, it } from "vitest"
import { playbackCommentary } from "./playback-history"
import type { TeachingPlan } from "./teaching-protocol"
import type { PlaybackSnapshot } from "../drawing/playback/types"

const plan: TeachingPlan = { concept: "circuit", level: "ks3", steps: [
  { commentary: "Source added.", actions: [{ type: "delete_object", id: "a" }] },
  { commentary: "The circuit is now closed.", actions: [{ type: "delete_object", id: "b" }] },
] }
const snapshot: PlaybackSnapshot = { state: "cancelled", actionIndex: 1, stepIndex: 1, totalActions: 2, totalSteps: 2, speed: 1 }
it("does not remember the unseen final step after cancellation", () => {
  expect(playbackCommentary(plan, snapshot)).toContain("Source added")
  expect(playbackCommentary(plan, snapshot)).not.toContain("closed")
})
it("records failure before any completed step explicitly", () => {
  expect(playbackCommentary(plan, { ...snapshot, state: "error", actionIndex: 0 })).toContain("No complete teaching step")
})
it("records the final commentary only on completion", () => {
  expect(playbackCommentary(plan, { ...snapshot, state: "completed", actionIndex: 2 })).toBe("The circuit is now closed.")
})
