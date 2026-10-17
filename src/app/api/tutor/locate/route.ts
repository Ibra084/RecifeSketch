import { NextResponse } from "next/server"
import { z } from "zod"
import { isAIConfigured, loadAIConfig } from "@/lib/ai/config"
import { GeminiProvider } from "@/lib/ai/gemini-provider"
import { MAX_LOCATE_PARTS } from "@/lib/ai/locate-parts"
import type { AIProvider } from "@/lib/ai/provider"
import { sourceImageSchema } from "@/lib/ai/question-source"
import { createRateLimiter, type RateLimiter } from "@/lib/ai/rate-limiter"

/**
 * POST /api/tutor/locate
 *
 * The zoomed-in "second look" at a figure the tutor copied: given the figure
 * alone, returns precise boxes for its parts. Called at most once per lesson,
 * and only when a lesson copies a figure with named parts. Signed-in students
 * only (enforced by the proxy for every /api route); the AI key stays here.
 */

const MAX_BODY_BYTES = 3_600_000
const imageBox = z.tuple([z.number().min(0).max(1000), z.number().min(0).max(1000), z.number().min(0).max(1000), z.number().min(0).max(1000)])
const requestSchema = z.strictObject({
  image: sourceImageSchema,
  parts: z.array(z.strictObject({ id: z.string().min(1).max(64), guess: imageBox.optional() })).min(1).max(MAX_LOCATE_PARTS),
})

const config = loadAIConfig()
const provider: AIProvider = new GeminiProvider({ config })
const rateLimiter: RateLimiter = createRateLimiter({ capacity: config.rateLimit.capacity, refillPerSec: config.rateLimit.refillPerSec })

export async function handleLocateRequest(request: Request, deps: { provider: AIProvider; rateLimiter: RateLimiter; isConfigured: boolean }) {
  if (!deps.isConfigured || !deps.provider.locateParts) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 })
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 })
  let json: unknown
  try { json = JSON.parse(text) } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }) }
  const parsed = requestSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 })

  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!deps.rateLimiter.tryConsume(key)) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 })

  const result = await deps.provider.locateParts(parsed.data, request.signal)
  if (!result.ok) {
    console.warn("[tutor/locate] second look failed; the lesson keeps its first guesses:", result.failure.kind)
    return NextResponse.json({ ok: false, error: result.failure.kind }, { status: 502 })
  }
  console.info(`[tutor/locate] ${result.parts.length}/${parsed.data.parts.length} parts located, ~${result.usage.approxInputTokens + result.usage.approxOutputTokens} tokens`)
  return NextResponse.json({ ok: true, figure: result.figure, parts: result.parts })
}

export async function POST(request: Request): Promise<Response> {
  return handleLocateRequest(request, { provider, rateLimiter, isConfigured: isAIConfigured(config) })
}
