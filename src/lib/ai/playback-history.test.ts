import { expect, it } from "vitest"
import { playbackExplanation } from "./playback-history"
import type { TeachingPlan } from "./teaching-protocol"
import type { PlaybackSnapshot } from "../drawing/playback/types"

const plan: TeachingPlan = { concept: "circuit", level: "ks3", steps: [
  { commentary: "Source added.", actions: [{ type: "delete_object", id: "a" }] },
  { commentary: "The circuit is now closed.", actions: [{ type: "delete_object", id: "b" }] },
] }
const snapshot: PlaybackSnapshot = { state: "cancelled", actionIndex: 1, stepIndex: 1, totalActions: 2, totalSteps: 2, speed: 1 }

it("does not remember the unseen final step after cancellation, and says where it stopped", () => {
  const remembered = playbackExplanation(plan, snapshot)
  expect(remembered).toContain("Source added")
  expect(remembered).not.toContain("closed")
  expect(remembered).toMatch(/Stopped after step 1 of 2/)
})
it("records failure before any completed step explicitly", () => {
  expect(playbackExplanation(plan, { ...snapshot, state: "error", actionIndex: 0 })).toContain("No complete teaching step")
})
it("remembers every step of a completed explanation, in order", () => {
  expect(playbackExplanation(plan, { ...snapshot, state: "completed", actionIndex: 2 }))
    .toBe("1. Source added. 2. The circuit is now closed.")
})
