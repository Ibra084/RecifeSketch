import {
  COORDINATE_LIMIT,
  arrowheadStyleSchema,
  colorSchema,
  dashStyleSchema,
  fillStyleSchema,
  geoShapeKindSchema,
  sizeStyleSchema,
} from "../drawing/protocol"
import { formatContextForPrompt, type TutorContext } from "./context"
import { MAX_ACTIONS_PER_STEP, MAX_COMMENTARY_LENGTH, MAX_TEACHING_STEPS } from "./teaching-protocol"
import { MAX_TOTAL_ACTIONS } from "./response-parser"

/**
 * Prompt construction for the AI tutor.
 *
 * Kept as plain, pure string-building so the exact wording can change
 * freely without touching anything that talks to a model or a network.
 * The model is told the *protocol* (the action vocabulary and the JSON
 * envelope), never given a library of example lessons to imitate - it
 * has to decide what to draw from the question itself.
 */

const ACTION_TYPES = [
  "create_shape",
  "create_freehand_path",
  "create_polygon",
  "draw_line",
  "draw_arrow",
  "write_text",
  "write_equation",
  "plot_function",
  "move_object",
  "update_object",
  "delete_object",
  "highlight_object",
  "clear_region",
  "focus_camera",
] as const

const ACTION_REFERENCE = `
Available action types (every action is one JSON object with a "type" field):

- create_shape { id, shape, x, y, w, h, color?, fill?, dash?, size?, label? }
    shape is one of: ${geoShapeKindSchema.options.join(", ")}
- create_freehand_path { id, points: [{x,y}, ...], color?, size?, closed? }
    for a hand-drawn-looking stroke that is not a straight-sided polygon.
- create_polygon { id, points: [{x,y}, ...] (>=3), color?, fill?, dash?, size? }
    for an arbitrary straight-sided shape with no matching "shape" kind.
- draw_line { id, points: [{x,y}, ...], color?, dash?, size? }
- draw_arrow { id, start: {x,y}, end: {x,y}, color?, dash?, size?, arrowheadStart?, arrowheadEnd?, label?, bend? }
- write_text { id, position: {x,y}, text, color?, size?, w? }
- write_equation { id, position: {x,y}, expression, color?, size? }
    expression is plain math notation, e.g. "a^2 + b^2 = c^2".
- plot_function { id, expression, domain: [min,max], samples?, position?, scale?, color?, size?, showAxes? }
    expression is a function of x, e.g. "sin(x)" or "x^2 - 3*x + 2". This is
    the ONLY way to draw a precise mathematical graph - never approximate a
    graph with create_freehand_path or create_polygon.
- move_object { id, position: {x,y} } - moves an object created earlier in THIS plan.
- update_object { id, patch: { color?, fill?, dash?, size?, text?, w?, h?, opacity? } }
- delete_object { id }
- highlight_object { id, color?, visible? }
- clear_region { region: {x,y,w,h} }
- focus_camera { target: { kind:"bounds", region:{x,y,w,h} } | { kind:"point", position:{x,y}, zoom? } }

Shared value types:
- color is one of: ${colorSchema.options.join(", ")}
- fill is one of: ${fillStyleSchema.options.join(", ")}
- dash is one of: ${dashStyleSchema.options.join(", ")}
- size is one of: ${sizeStyleSchema.options.join(", ")}
- arrowheadStart/arrowheadEnd is one of: ${arrowheadStyleSchema.options.join(", ")}
- every coordinate must be a finite number between -${COORDINATE_LIMIT} and ${COORDINATE_LIMIT}
- every id is a short string unique within this plan, using only letters, numbers, "_" and "-"
`.trim()

const RESPONSE_FORMAT = `
Respond with JSON only - no prose before or after it, no markdown code fence.
The JSON must match exactly this shape:

{
  "concept": string,          // short name of the concept being taught
  "level": "ks3" | "ks4",      // your best estimate of the UK school level this question targets
  "steps": [
    {
      "commentary": string,    // one or two short sentences of teaching commentary for this step (<= ${MAX_COMMENTARY_LENGTH} chars)
      "actions": [ /* 1 to ${MAX_ACTIONS_PER_STEP} action objects from the list above */ ],
      "pauseAfterMs": number   // optional, 0-5000, a short pause before the next step
    }
  ]
}

Use at most ${MAX_TEACHING_STEPS} steps and at most ${MAX_TOTAL_ACTIONS} actions in total across the whole plan.
`.trim()

const TEACHING_RULES = `
You are an AI tutor that teaches by drawing on an infinite whiteboard, the
way a teacher would sketch on a blackboard while explaining.

Rules:
- Build the illustration out of the drawing actions above. Never produce or
  reference an image file, image URL or any image-generation output - the
  whiteboard only understands these editable drawing primitives.
- Never pick a diagram from a fixed library of lessons. Decide what to draw
  from the question itself, as if sketching it for the first time.
- QUANTITATIVE PRECISION: plot_function is the only way to draw a graph that
  claims to be mathematically accurate - it renders its own correctly-scaled
  axes, tick marks and numeric labels automatically. Never hand-draw axes,
  tick marks, or a curve with create_freehand_path/create_polygon/draw_line
  and call it a graph - that would show the student a precise-looking curve
  the model just made up. If you only know the general shape of a
  relationship (not real numbers), draw it as a visibly rough, conceptual
  sketch instead (freehand is fine for this) and say in the commentary or a
  nearby label that it's a sketch, not a precise graph - never let a
  conceptual sketch imitate the look of real plotted data.
- Plan layout so shapes, labels and arrows don't overlap: space objects out,
  and place each label close to (just below or beside) the exact object it
  names, not floating in open space elsewhere.
- Keep each step's actions closely related (e.g. a shape and the label that
  names it belong in the same step) so they read as one idea appearing at once.
- Order steps logically: establish the basic picture first, then build each
  later step on what the previous one already drew, the way a teacher adds
  to a diagram rather than restarting it.
- Write for a UK Year 7-11 student: correct scientific/mathematical
  terminology, but plain sentences - if you use a technical term, its
  meaning should be clear from context or a few plain words right after it.
  Keep commentary short (a sentence or two per step, never a paragraph) and
  encouraging, and keep the whole diagram uncluttered - prefer a few well-
  placed labels over many.
- Use consistent scale for shapes that represent comparable things.
- Stay within a roughly 1200x900 working area near the origin unless the
  question genuinely needs more room.
`.trim()

export function buildTeachingPrompt(question: string, context?: TutorContext): string {
  const contextText = formatContextForPrompt(context)

  return [
    TEACHING_RULES,
    "",
    ACTION_REFERENCE,
    "",
    RESPONSE_FORMAT,
    ...(contextText ? ["", contextText] : []),
    "",
    `Student's question: ${question}`,
  ].join("\n")
}

export interface RepairPromptInput {
  question: string
  invalidResponse: string
  errorMessage: string
}

export function buildRepairPrompt({ question, invalidResponse, errorMessage }: RepairPromptInput): string {
  return [
    `You previously answered the question "${question}" but your response was invalid.`,
    "",
    "Your previous response:",
    invalidResponse,
    "",
    "The validation error was:",
    errorMessage,
    "",
    "Fix the response so it is valid JSON that exactly matches the required shape, and respond with JSON only.",
  ].join("\n")
}

export const SUPPORTED_ACTION_TYPES = ACTION_TYPES
