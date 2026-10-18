import type { QuestionSource } from "@/lib/ai/question-source"
import type { TeachingPlan } from "@/lib/ai/teaching-protocol"
import { expandBox, fromCropSpace, toCropSpace } from "@/lib/drawing/figure-copy"
import type { DrawingAction } from "@/lib/drawing/protocol"

type Box = [number, number, number, number]
type CopyFigure = Extract<DrawingAction, { type: "copy_figure" }>
type SourceImage = NonNullable<QuestionSource["image"]>

/** Room left around the figure in the crop, so a part the first guess clipped is still in view. */
const CROP_MARGIN = 0.15
/** A second look that takes longer than this isn't worth holding the lesson for. */
const SECOND_LOOK_TIMEOUT_MS = 12_000

/** The lesson's first copied figure that has named parts - the only one that gets a second look. */
export function figureNeedingSecondLook(plan: TeachingPlan): CopyFigure | undefined {
  for (const step of plan.steps) {
    for (const action of step.actions) {
      if (action.type === "copy_figure" && action.parts && action.parts.length > 0) return action
    }
  }
  return undefined
}

/** The area of the question image to show the second look: the figure and every part, with margin. */
export function secondLookCrop(figure: CopyFigure): Box {
  const boxes = [figure.box, ...(figure.parts ?? []).map((p) => p.box)]
  const union: Box = [
    Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3])),
  ]
  return expandBox(union, CROP_MARGIN)
}

/**
 * The plan with the second look's findings applied to that figure: each part
 * it located gets its precise box (mapped back from the crop to the whole
 * question image), and the figure's box takes in its located extent. Parts it
 * didn't find keep their first guess.
 */
export function applySecondLook(
  plan: TeachingPlan,
  figure: CopyFigure,
  crop: Box,
  found: { figure?: Box; parts: { id: string; box: Box }[] }
): TeachingPlan {
  const located = new Map(found.parts.map((p) => [p.id, fromCropSpace(p.box, crop)]))
  if (located.size === 0 && !found.figure) return plan
  const parts = (figure.parts ?? []).map((part) => (located.has(part.id) ? { ...part, box: located.get(part.id)! } : part))
  const extents = [found.figure ? fromCropSpace(found.figure, crop) : figure.box, ...parts.map((p) => p.box)]
  const box: Box = [
    Math.min(...extents.map((b) => b[0])), Math.min(...extents.map((b) => b[1])),
    Math.max(...extents.map((b) => b[2])), Math.max(...extents.map((b) => b[3])),
  ]
  const refined: CopyFigure = { ...figure, box, parts }
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      step.actions.includes(figure) ? { ...step, actions: step.actions.map((action) => (action === figure ? refined : action)) } : step
    ),
  }
}

/** Cuts `box` (0-1000 of the image) out of an encoded image, at the image's own resolution. */
async function cropImage(image: SourceImage, box: Box): Promise<SourceImage> {
  const element = new Image()
  element.src = `data:${image.mimeType};base64,${image.data}`
  await element.decode()
  const sx = (box[1] / 1000) * element.naturalWidth, sy = (box[0] / 1000) * element.naturalHeight
  const sw = ((box[3] - box[1]) / 1000) * element.naturalWidth, sh = ((box[2] - box[0]) / 1000) * element.naturalHeight
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(sw))
  canvas.height = Math.max(1, Math.round(sh))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no canvas")
  ctx.fillStyle = "white"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(element, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  return { mimeType: "image/png", data: canvas.toDataURL("image/png").split(",")[1], width: canvas.width, height: canvas.height }
}

/**
 * The zoomed-in second look: if the lesson copies a figure with named parts,
 * show the AI just that figure and ask exactly where each part is. At most one
 * small request per lesson. Any failure - offline, slow, unreadable answer -
 * returns the plan unchanged, so it can only ever make placement better.
 */
export async function refineCopiedFigure(plan: TeachingPlan, image: SourceImage | undefined, signal?: AbortSignal): Promise<TeachingPlan> {
  const figure = figureNeedingSecondLook(plan)
  if (!figure || !image) return plan
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), SECOND_LOOK_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener("abort", onAbort)
  try {
    const crop = secondLookCrop(figure)
    const cropped = await cropImage(image, crop)
    const response = await fetch("/api/tutor/locate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: cropped, parts: (figure.parts ?? []).map((p) => ({ id: p.id, guess: toCropSpace(p.box, crop) })) }),
      signal: controller.signal,
    })
    if (!response.ok) return plan
    const json = (await response.json()) as { ok: boolean; figure?: Box; parts?: { id: string; box: Box }[] }
    if (!json.ok) return plan
    return applySecondLook(plan, figure, crop, { figure: json.figure, parts: json.parts ?? [] })
  } catch {
    return plan
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener("abort", onAbort)
  }
}
