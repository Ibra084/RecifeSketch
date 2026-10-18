import { z } from "zod"
import type { ImageBox } from "./provider"

/** The second look answers with a handful of boxes: this is plenty, and caps what it can cost. */
export const LOCATE_MAX_OUTPUT_TOKENS = 600
/** Short, so a slow answer never holds a lesson up for long. */
export const LOCATE_TIMEOUT_MS = 10_000
export const MAX_LOCATE_PARTS = 12

/** Provider-neutral prompt for the zoomed-in look at a copied figure. */
export function buildLocatePrompt(parts: { id: string; guess?: ImageBox }[]): string {
  return [
    "The image is a diagram cropped from an exam question. Locate these objects in it precisely.",
    "For each part, return the TIGHT bounding box of exactly that drawn object (the mass's own circle or block, the",
    "pulley wheel, the particle...) - not its label text, string or surroundings. Also return the tight box of the",
    "whole diagram. Boxes are [ymin, xmin, ymax, xmax] on a 0-1000 scale of THIS image.",
    "Each part's id names the object; `guess` is a rough first estimate (same scale) to tell similar objects apart.",
    `Parts: ${JSON.stringify(parts)}`,
    'Respond with JSON only: {"figure": [ymin, xmin, ymax, xmax], "parts": [{"id": string, "box": [ymin, xmin, ymax, xmax]}]}',
    "Omit a part you cannot see rather than guessing.",
  ].join("\n")
}

const boxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()])
  .transform((b) => b.map((v) => Math.min(1000, Math.max(0, v))) as ImageBox)
  .refine(([ymin, xmin, ymax, xmax]) => ymax > ymin && xmax > xmin)

const partSchema = z.object({ id: z.string(), box: boxSchema })
const responseSchema = z.object({ figure: z.unknown().optional(), parts: z.array(z.unknown()).optional() })

/** Reads the answer leniently: unknown ids and malformed boxes are dropped, never trusted. */
export function parseLocateResponse(raw: string, ids: string[]): { figure?: ImageBox; parts: { id: string; box: ImageBox }[] } | null {
  let json: unknown
  try {
    json = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""))
  } catch {
    return null
  }
  const parsed = responseSchema.safeParse(json)
  if (!parsed.success) return null
  const wanted = new Set(ids)
  const parts = (parsed.data.parts ?? []).flatMap((entry) => {
    const part = partSchema.safeParse(entry)
    return part.success && wanted.has(part.data.id) ? [part.data] : []
  })
  const figure = boxSchema.safeParse(parsed.data.figure)
  return { ...(figure.success ? { figure: figure.data } : {}), parts }
}
