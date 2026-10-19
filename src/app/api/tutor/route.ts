import { NextResponse } from "next/server"
import { z } from "zod"
import { loadAIConfig, isAIConfigured } from "@/lib/ai/config"
import { existingIdsFrom, sanitizeTutorContext, tutorContextSchema } from "@/lib/ai/context"
import { GeminiProvider } from "@/lib/ai/gemini-provider"
import { runTeachingPipeline, type TeachingPipelineFailure } from "@/lib/ai/pipeline"
import type { AIProvider } from "@/lib/ai/provider"
import { createRateLimiter, type RateLimiter } from "@/lib/ai/rate-limiter"
import { protectEarlierWork, resolveTeachingPlanIds } from "@/lib/ai/teaching-protocol"
import { questionSourceSchema } from "@/lib/ai/question-source"

/**
 * POST /api/tutor
 *
 * The only place a browser talks to the AI. Accepts a student's question,
 * runs it through the provider-agnostic pipeline, and returns a validated
 * teaching plan (or a structured error). The Gemini API key never leaves
 * this server - `loadAIConfig` only ever runs here.
 */

// A raw request body bigger than this is rejected before it is even
// JSON-parsed, independent of the (much smaller) question-length cap the
// pipeline enforces afterwards.
// Room for the full-detail question image plus a picture of the student's working.
const MAX_BODY_BYTES = 7_000_000

const requestSchema = z.strictObject({
  question: z.string(),
  // Checked leniently below: board context must never stop a question being answered.
  context: z.unknown().optional(),
  source: questionSourceSchema.optional(),
})

const config = loadAIConfig()
const provider: AIProvider = new GeminiProvider({ config })
const rateLimiter: RateLimiter = createRateLimiter({
  capacity: config.rateLimit.capacity,
  refillPerSec: config.rateLimit.refillPerSec,
})

function clientKeyFrom(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")
  return forwardedFor?.split(",")[0]?.trim() || "unknown"
}

const FAILURE_STATUS: Record<TeachingPipelineFailure["kind"], number> = {
  invalid_question: 400,
  missing_api_key: 500,
  rate_limited: 429,
  timeout: 504,
  cancelled: 499,
  invalid_output: 502,
  provider_error: 502,
}

const FAILURE_MESSAGE: Record<TeachingPipelineFailure["kind"], string> = {
  invalid_question: "That question couldn't be sent - check its length and try again.",
  missing_api_key: "The AI tutor isn't configured yet on this server (missing API key).",
  rate_limited: "You're asking questions a bit fast - please wait a few seconds and try again.",
  timeout: "The AI tutor took too long to respond. Please try again.",
  cancelled: "The request was cancelled.",
  invalid_output: "The AI tutor produced an answer that couldn't be understood. Please try again.",
  provider_error: "The AI tutor is temporarily unavailable. Please try again shortly.",
}

export interface TutorRouteDeps {
  provider: AIProvider
  rateLimiter: RateLimiter
  isConfigured: boolean
}

export async function handleTutorRequest(request: Request, deps: TutorRouteDeps): Promise<Response> {
  const bodyText = await request.text()
  if (bodyText.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_question", message: FAILURE_MESSAGE.invalid_question } },
      { status: 400 }
    )
  }

  let bodyJson: unknown
  try {
    bodyJson = JSON.parse(bodyText)
  } catch {
    return NextResponse.json(
      { ok: false, error: { code: "invalid_request", message: "Request body must be valid JSON." } },
      { status: 400 }
    )
  }

  const parsedBody = requestSchema.safeParse(bodyJson)
  if (!parsedBody.success) {
    // Say exactly which part was wrong (and log it), rather than a generic message that hides the cause.
    const issue = parsedBody.error.issues[0]
    const where = issue?.path.length ? issue.path.join(".") : "request"
    console.warn("[tutor] rejected request:", where, issue?.message)
    return NextResponse.json(
      { ok: false, error: { code: "invalid_request", message: `The question couldn't be sent (${where}: ${issue?.message ?? "invalid"}). Please try again.` } },
      { status: 400 }
    )
  }

  const context = sanitizeTutorContext(parsedBody.data.context)
  const strictContext = parsedBody.data.context === undefined ? null : tutorContextSchema.safeParse(parsedBody.data.context)
  if (strictContext && !strictContext.success) {
    console.warn("[tutor] board context was out of range and has been tidied:", strictContext.error.issues[0]?.path.join("."), strictContext.error.issues[0]?.message)
  }
  const result = await runTeachingPipeline({
    question: parsedBody.data.question,
    source: parsedBody.data.source,
    context,
    clientKey: clientKeyFrom(request),
    provider: deps.provider,
    rateLimiter: deps.rateLimiter,
    isConfigured: deps.isConfigured,
    signal: request.signal,
  })

  if (!result.ok) {
    console.error("[tutor] pipeline failure", JSON.stringify(result.failure))
    const overloaded = result.failure.kind === "provider_error" && result.failure.httpStatus === 503
    return NextResponse.json(
      { ok: false, error: { code: result.failure.kind, message: overloaded
        ? "Google's AI service is busy right now. Your board is saved. Please retry your question shortly."
        : FAILURE_MESSAGE[result.failure.kind] } },
      { status: FAILURE_STATUS[result.failure.kind] }
    )
  }

  // What each answer costs, so token use can be watched (counts as reported by the provider when available).
  console.info(`[tutor] answered: ~${result.usage.approxInputTokens} input + ${result.usage.approxOutputTokens} output tokens, ~$${result.usage.estimatedCostUsd.toFixed(4)}`)
  const existingIds = existingIdsFrom(context)
  // Earlier work (e.g. a previous graph) is never deleted unless the student asked for that.
  const resolvedPlan = protectEarlierWork(resolveTeachingPlanIds(result.plan, existingIds), existingIds, parsedBody.data.question)
  return NextResponse.json({ ok: true, plan: resolvedPlan, usage: result.usage }, { status: 200 })
}

export async function POST(request: Request): Promise<Response> {
  return handleTutorRequest(request, { provider, rateLimiter, isConfigured: isAIConfigured(config) })
}
