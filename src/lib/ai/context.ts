import { z } from "zod"
import { coordinateSchema, dimensionSchema, objectIdSchema, regionSchema } from "../drawing/protocol"

/**
 * The compact, bounded context a client sends with each follow-up
 * question - a snapshot of what's already on the whiteboard (from the
 * engine's own tracked objects, never the raw tldraw document) plus a
 * short rolling history of prior turns. Both halves are capped so this
 * can never grow into "the entire document" or "the whole conversation"
 * on a long session.
 */

export const MAX_CONTEXT_OBJECTS = 60
export const MAX_HISTORY_TURNS = 4
const MAX_OBJECT_KIND_LENGTH = 20
const MAX_OBJECT_LABEL_LENGTH = 200
const MAX_HISTORY_QUESTION_LENGTH = 500
const MAX_HISTORY_CONCEPT_LENGTH = 200
const MAX_HISTORY_COMMENTARY_LENGTH = 400

export const objectSummarySchema = z.strictObject({
  id: objectIdSchema,
  kind: z.string().min(1).max(MAX_OBJECT_KIND_LENGTH),
  label: z.string().max(MAX_OBJECT_LABEL_LENGTH).optional(),
  x: coordinateSchema,
  y: coordinateSchema,
  w: dimensionSchema,
  h: dimensionSchema,
  /** Ids of other known objects this one (usually an arrow) visually connects to. */
  connects: z.array(objectIdSchema).max(4).optional(),
})
export type ObjectSummary = z.infer<typeof objectSummarySchema>

export const priorTurnSchema = z.strictObject({
  question: z.string().min(1).max(MAX_HISTORY_QUESTION_LENGTH),
  concept: z.string().min(1).max(MAX_HISTORY_CONCEPT_LENGTH),
  lastCommentary: z.string().min(1).max(MAX_HISTORY_COMMENTARY_LENGTH),
})
export type PriorTurn = z.infer<typeof priorTurnSchema>

export const tutorContextSchema = z.strictObject({
  objects: z.array(objectSummarySchema).max(MAX_CONTEXT_OBJECTS),
  history: z.array(priorTurnSchema).max(MAX_HISTORY_TURNS),
  layout: z.strictObject({
    viewport: regionSchema,
    occupied: z.array(regionSchema).max(120),
    freshArea: regionSchema,
  }).optional(),
})
export type TutorContext = z.infer<typeof tutorContextSchema>

export function existingIdsFrom(context: TutorContext | undefined): string[] {
  return context?.objects.map((object) => object.id) ?? []
}

export function formatContextForPrompt(context: TutorContext | undefined): string {
  if (!context) return ""

  const parts: string[] = []
  if (context.layout) {
    parts.push(`Board layout in page coordinates: ${JSON.stringify(context.layout)}`,
      "Occupied rectangles include student work, images, labels and earlier drawings. Do not cover them. For an unrelated NEW topic, use freshArea, not the origin. For an edit, retain the existing object's position and id. Fit the NEW lesson into a readable area and focus_camera on that lesson only, never the entire accumulated board. Keep graph height around 400–550 units: choose x/y scales independently from the actual function range. Leave space beside the lesson for commentary.")
  }

  if (context.history.length > 0) {
    parts.push("Recent conversation on this whiteboard (most recent last):")
    for (const turn of context.history) {
      parts.push(`- Q: "${turn.question}" -> taught "${turn.concept}": ${turn.lastCommentary}`)
    }
  }

  if (context.objects.length > 0) {
    if (parts.length > 0) parts.push("")
    parts.push(
      "Objects already on the whiteboard from earlier turns. To edit, move, highlight or " +
        "delete one of these, reuse its EXACT existing id below - never invent a new id for " +
        "the same object. Give any brand-new object a brand-new id that is not in this list. " +
        "When the question is a follow-up, continue and extend the existing diagram, and only remove " +
        "something from it if it is genuinely obsolete for answering this question."
    )
    for (const object of context.objects) {
      const label = object.label ? ` "${object.label}"` : ""
      const connects = object.connects?.length ? ` (connects: ${object.connects.join(", ")})` : ""
      parts.push(
        `- ${object.id}: ${object.kind}${label} at (${Math.round(object.x)},${Math.round(object.y)}) ` +
          `size ${Math.round(object.w)}x${Math.round(object.h)}${connects}`
      )
    }
  }

  return parts.join("\n")
}

