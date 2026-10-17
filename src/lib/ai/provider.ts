import type { TutorContext } from "./context"
import type { TeachingPlan } from "./teaching-protocol"
import type { UsageEstimate } from "./usage-tracker"
import type { QuestionSource } from "./question-source"

/**
 * The provider seam: everything downstream (the pipeline, the API route)
 * talks only to this interface, never to a specific vendor SDK. Swapping
 * the "initial provider is Gemini" decision for a different one later
 * means writing one new file that implements this interface - nothing
 * else changes.
 */

export type TeachingPlanFailure =
  | { kind: "missing_api_key" }
  | { kind: "timeout" }
  | { kind: "rate_limited" }
  | { kind: "invalid_output"; detail: string }
  | { kind: "provider_error"; detail: string; httpStatus?: number }
  | { kind: "cancelled" }

export interface TeachingPlanSuccess {
  ok: true
  plan: TeachingPlan
  usage: UsageEstimate
}

export interface TeachingPlanFailureResult {
  ok: false
  failure: TeachingPlanFailure
}

export type TeachingPlanResult = TeachingPlanSuccess | TeachingPlanFailureResult

export interface TeachingPlanRequest {
  question: string
  source?: QuestionSource
  /** Compact summary of what's already on the board and recent history, for follow-ups. */
  context?: TutorContext
}

/** A box in an image: [ymin, xmin, ymax, xmax] on a 0-1000 scale of that image. */
export type ImageBox = [number, number, number, number]

/**
 * The "second look" at a copied figure: the figure alone (cropped from the
 * question), and the parts the lesson attaches things to. Returns each part's
 * tight box in THAT cropped image - far more precise than locating them in the
 * whole question, where the figure is only a small part of the picture.
 */
export interface LocatePartsRequest {
  image: NonNullable<QuestionSource["image"]>
  parts: { id: string; guess?: ImageBox }[]
}

export type LocatePartsResult =
  | { ok: true; figure?: ImageBox; parts: { id: string; box: ImageBox }[]; usage: UsageEstimate }
  | { ok: false; failure: TeachingPlanFailure }

export interface AIProvider {
  generateTeachingPlan(request: TeachingPlanRequest, signal?: AbortSignal): Promise<TeachingPlanResult>
  /** Optional: providers that can't do it simply leave the first guesses in place. */
  locateParts?(request: LocatePartsRequest, signal?: AbortSignal): Promise<LocatePartsResult>
}
