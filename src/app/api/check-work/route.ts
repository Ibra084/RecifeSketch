import { NextResponse } from "next/server"
import { z } from "zod"
import { isAIConfigured, loadAIConfig } from "@/lib/ai/config"
import { GeminiProvider } from "@/lib/ai/gemini-provider"
import type { AIProvider } from "@/lib/ai/provider"
import { sourceImageSchema } from "@/lib/ai/question-source"
import { createRateLimiter, type RateLimiter } from "@/lib/ai/rate-limiter"
import { getCurrentUser } from "@/lib/auth/session"
import { practiceForBoard, recordPracticeResult } from "@/lib/mistakes/data"
import { decideCheck } from "@/lib/mistakes/decide"
import { issueSaveToken } from "@/lib/mistakes/save-token"
import type { CheckWorkResult } from "@/lib/mistakes/schema"
import { isWhiteboardId, ownsWhiteboard } from "@/lib/whiteboards/data"

/**
 * POST /api/check-work - "Check my work" from the companion.
 *
 * The AI reads the student's working from the cropped image they selected;
 * the deterministic maths checker decides whether it's right. On a practice
 * board, the attempt is marked against the question stored on the server
 * (never one sent by the browser) and the mistake's practice status updated.
 */

const MAX_BODY_BYTES = 3_600_000
const requestSchema = z.strictObject({
  image: sourceImageSchema,
  boardId: z.string().max(64).optional(),
})

const config = loadAIConfig()
const provider: AIProvider = new GeminiProvider({ config })
// About 6 checks in a burst, then one every 20 seconds per student.
const limiter: RateLimiter = createRateLimiter({ capacity: 6, refillPerSec: 1 / 20 })

export interface CheckWorkDeps {
  provider: AIProvider
  limiter: RateLimiter
  isConfigured: boolean
}

export async function handleCheckWork(request: Request, deps: CheckWorkDeps): Promise<Response> {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (!deps.isConfigured || !deps.provider.checkWork) {
    return NextResponse.json({ error: "Checking work isn't available on this server yet." }, { status: 503 })
  }
  if (!deps.limiter.tryConsume(user.id)) {
    return NextResponse.json({ error: "You're checking a bit fast - wait a few seconds and try again." }, { status: 429 })
  }

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "That selection is too large - select just your working." }, { status: 413 })
  let json: unknown
  try { json = JSON.parse(text) } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }
  const parsed = requestSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 })

  const boardId = parsed.data.boardId && isWhiteboardId(parsed.data.boardId) && (await ownsWhiteboard(parsed.data.boardId)) ? parsed.data.boardId : null
  const practice = boardId ? await practiceForBoard(boardId) : null

  const reading = await deps.provider.checkWork({ image: parsed.data.image, practicePrompt: practice?.question.prompt }, request.signal)
  if (!reading.ok) {
    console.warn("[check-work] reading failed:", reading.failure.kind)
    const busy = reading.failure.kind === "rate_limited" || reading.failure.kind === "provider_error" || reading.failure.kind === "timeout"
    const result: CheckWorkResult = {
      verdict: "uncertain",
      headline: busy ? "I couldn't check that just now - please try again in a moment." : "I couldn't read that reliably, so I won't mark it. Try selecting just your working.",
    }
    return NextResponse.json(result)
  }
  console.info(`[check-work] ~${reading.usage.approxInputTokens} input + ${reading.usage.approxOutputTokens} output tokens`)

  const result = decideCheck(reading.reading, { practice: practice?.question, sourceBoardId: boardId })
  if (practice && result.practice) await recordPracticeResult(practice.mistakeId, result.practice)
  if (result.draft) result.saveToken = issueSaveToken(user.id, result.draft)
  return NextResponse.json(result)
}

export async function POST(request: Request): Promise<Response> {
  return handleCheckWork(request, { provider, limiter, isConfigured: isAIConfigured(config) })
}
