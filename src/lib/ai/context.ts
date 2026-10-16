import { z } from "zod"
import { COORDINATE_LIMIT, coordinateSchema, DIMENSION_LIMIT, DIMENSION_MIN, dimensionSchema, objectIdSchema, regionSchema } from "../drawing/protocol"

/**
 * The compact, bounded context a client sends with each follow-up
 * question - a snapshot of what's already on the whiteboard (from the
 * engine's own tracked objects, never the raw tldraw document) plus a
 * short rolling history of prior turns. Both halves are capped so this
 * can never grow into "the entire document" or "the whole conversation"
 * on a long session.
 */

export const MAX_CONTEXT_OBJECTS = 60
export const MAX_HISTORY_TURNS = 6
const MAX_OBJECT_KIND_LENGTH = 20
const MAX_OBJECT_LABEL_LENGTH = 200
const MAX_HISTORY_QUESTION_LENGTH = 500
const MAX_HISTORY_CONCEPT_LENGTH = 200
/** Every step the student saw of one answer (see playbackExplanation). */
const MAX_HISTORY_EXPLANATION_LENGTH = 1600

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
  explanation: z.string().min(1).max(MAX_HISTORY_EXPLANATION_LENGTH),
})
export type PriorTurn = z.infer<typeof priorTurnSchema>

/** What the student selected on the board before asking - the thing their question is about. */
export const selectionSchema = z.strictObject({
  region: regionSchema,
  objects: z.array(z.strictObject({
    /** The tutor's own id for it, when the tutor drew it (so it can be edited or highlighted). */
    id: objectIdSchema.optional(),
    kind: z.string().min(1).max(40),
    label: z.string().max(MAX_OBJECT_LABEL_LENGTH).optional(),
    bounds: regionSchema,
  })).min(1).max(30),
})
export type BoardSelection = z.infer<typeof selectionSchema>

export const tutorContextSchema = z.strictObject({
  objects: z.array(objectSummarySchema).max(MAX_CONTEXT_OBJECTS),
  history: z.array(priorTurnSchema).max(MAX_HISTORY_TURNS),
  selection: selectionSchema.optional(),
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

  if (context.selection) {
    const { region, objects } = context.selection
    const r = (n: number) => Math.round(n)
    parts.push(
      "THE STUDENT SELECTED PART OF THE BOARD BEFORE ASKING - their question is about exactly this:",
      ...objects.map((o) => `- ${o.id ? `${o.id}: ` : ""}${o.kind}${o.label ? ` "${o.label}"` : ""} at (${r(o.bounds.x)},${r(o.bounds.y)}) size ${r(o.bounds.w)}x${r(o.bounds.h)}`),
      `Selected area: x=${r(region.x)}, y=${r(region.y)}, w=${r(region.w)}, h=${r(region.h)}.`,
      "Answer about the selected items specifically (\"this\" / \"it\" / \"here\" means them). Draw your response " +
        `RIGHT BESIDE the selection: start new drawings and notes at x=${r(region.x + region.w + 40)}, y=${r(region.y)} ` +
        `(or just below it, from y=${r(region.y + region.h + 40)}, if the right side is taken), and connect them to the ` +
        "selected items with short arrows or marks. To change or highlight a selected item that has an id, reuse " +
        "that id. Never delete or move the selected items unless asked.",
      ""
    )
  }

  if (context.history.length > 0) {
    parts.push("This question continues a conversation on this whiteboard (most recent last; each entry lists the steps the student was actually shown):")
    for (const turn of context.history) {
      parts.push(`- Q: "${turn.question}" -> taught "${turn.concept}": ${turn.explanation}`)
    }
    parts.push(
      "Treat the new question as a follow-up in this chain unless it is clearly about something unrelated. " +
        "Words like \"this\", \"that step\", \"why\" or \"what next\" refer to the most recent answer. " +
        "Build on what was already explained and drawn instead of repeating it: reuse the existing objects, " +
        "keep the same notation, values and part colours, and add the new working beside or below the " +
        "earlier working. If the student stopped a lesson early, continue from the last step they saw."
    )
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


const clampNumber = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

/** A rectangle forced into the board's allowed range: positions within ±COORDINATE_LIMIT, sizes 1..DIMENSION_LIMIT. */
function clampRegion(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw
  const r = raw as Record<string, unknown>
  return {
    x: clampNumber(r.x, -COORDINATE_LIMIT, COORDINATE_LIMIT, 0),
    y: clampNumber(r.y, -COORDINATE_LIMIT, COORDINATE_LIMIT, 0),
    w: clampNumber(r.w, DIMENSION_MIN, DIMENSION_LIMIT, DIMENSION_MIN),
    h: clampNumber(r.h, DIMENSION_MIN, DIMENSION_LIMIT, DIMENSION_MIN),
  }
}

/** Keeps the items of an array that pass `schema` (after `fix`), up to `max`. */
function validItems<T>(raw: unknown, schema: z.ZodType<T>, max: number, fix: (item: unknown) => unknown = (item) => item): T[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const parsed = schema.safeParse(fix(item))
    return parsed.success ? [parsed.data] : []
  }).slice(-max)
}

/**
 * The board context, made valid rather than rejected. It only helps the
 * tutor place its drawing, so it must never stop a question being answered:
 * a board zoomed far out (whose visible area is bigger than the size limit),
 * content panned a long way, or one odd object are clamped or dropped, and
 * only if nothing can be salvaged is the context left out altogether.
 */
export function sanitizeTutorContext(raw: unknown): TutorContext | undefined {
  if (raw === undefined || raw === null) return undefined
  const exact = tutorContextSchema.safeParse(raw)
  if (exact.success) return exact.data
  if (typeof raw !== "object") return undefined
  const r = raw as Record<string, unknown>
  const fixObject = (item: unknown) => {
    if (!item || typeof item !== "object") return item
    const o = item as Record<string, unknown>
    return {
      ...o, ...(clampRegion(o) as object),
      ...(typeof o.label === "string" ? { label: o.label.slice(0, MAX_OBJECT_LABEL_LENGTH) } : {}),
    }
  }
  const layout = r.layout && typeof r.layout === "object" ? (r.layout as Record<string, unknown>) : undefined
  const candidate = {
    objects: validItems(r.objects, objectSummarySchema, MAX_CONTEXT_OBJECTS, fixObject),
    history: validItems(r.history, priorTurnSchema, MAX_HISTORY_TURNS),
    ...(layout ? { layout: {
      viewport: clampRegion(layout.viewport),
      occupied: validItems(layout.occupied, regionSchema, 120, clampRegion),
      freshArea: clampRegion(layout.freshArea),
    } } : {}),
  }
  const selection = r.selection && typeof r.selection === "object" ? (r.selection as Record<string, unknown>) : undefined
  const selectionObjects = selection ? validItems(selection.objects, selectionSchema.shape.objects.element, 30, (item) => {
    if (!item || typeof item !== "object") return item
    const o = item as Record<string, unknown>
    return { ...o, bounds: clampRegion(o.bounds) }
  }) : []
  const withSelection = selectionObjects.length
    ? { ...candidate, selection: { region: clampRegion(selection!.region), objects: selectionObjects } }
    : candidate
  const salvaged = tutorContextSchema.safeParse(withSelection)
  if (salvaged.success) return salvaged.data
  const withoutLayout = tutorContextSchema.safeParse({ objects: candidate.objects, history: candidate.history })
  return withoutLayout.success ? withoutLayout.data : undefined
}
