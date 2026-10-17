import type { AIConfig } from "./config"
import { buildRepairPrompt, buildTeachingPrompt } from "./prompt"
import type { AIProvider, LocatePartsRequest, LocatePartsResult, TeachingPlanFailure, TeachingPlanRequest, TeachingPlanResult } from "./provider"
import { buildLocatePrompt, LOCATE_MAX_OUTPUT_TOKENS, LOCATE_TIMEOUT_MS, parseLocateResponse } from "./locate-parts"
import { isTransientFailure, MAX_TRANSIENT_RETRIES, TRANSIENT_RETRY_DELAY_MS } from "./retry"
import { parseTeachingPlanResponse } from "./response-parser"
import { estimateUsage, usageFromMeasuredTokens, type UsageEstimate } from "./usage-tracker"
import { sourcePrompt, type QuestionSource } from "./question-source"
import { visualPlanIssue } from "./teaching-protocol"

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The Gemini-backed `AIProvider`.
 *
 * Talks to Gemini's REST `generateContent` endpoint directly over `fetch`
 * (no vendor SDK dependency). Only this file knows the shape of Gemini's
 * request/response bodies - everything else in `src/lib/ai` is provider-
 * agnostic and talks to the plain `AIProvider` interface instead.
 */

interface GeminiPart {
  text?: string
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] }
  finishReason?: string
}

interface GeminiUsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[]
  promptFeedback?: { blockReason?: string }
  usageMetadata?: GeminiUsageMetadata
}

function extractText(response: GeminiGenerateContentResponse): string | null {
  const text = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? ""
  return text.length > 0 ? text : null
}

/** Builds a `UsageEstimate` from Gemini's own reported counts, falling back to the char-based guess if it omitted them. */
function usageFrom(response: GeminiGenerateContentResponse, prompt: string, text: string): UsageEstimate {
  const { promptTokenCount, candidatesTokenCount } = response.usageMetadata ?? {}
  if (promptTokenCount !== undefined && candidatesTokenCount !== undefined) {
    return usageFromMeasuredTokens(promptTokenCount, candidatesTokenCount + (response.usageMetadata?.thoughtsTokenCount ?? 0))
  }
  return estimateUsage({ promptChars: prompt.length, responseChars: text.length })
}

type GeminiCallResult =
  | { ok: true; text: string; usage: UsageEstimate }
  | { ok: false; failure: TeachingPlanFailure }

export interface GeminiProviderOptions {
  config: AIConfig
  fetchImpl?: typeof fetch
}

export class GeminiProvider implements AIProvider {
  constructor(private readonly options: GeminiProviderOptions) {}

  async generateTeachingPlan(
    request: TeachingPlanRequest,
    signal?: AbortSignal
  ): Promise<TeachingPlanResult> {
    const { config } = this.options
    const apiKey = config.gemini.apiKey
    if (!apiKey) return { ok: false, failure: { kind: "missing_api_key" } }

    const { question, context } = request
    const promptOptions = { desmos: config.desmos === true }
    let prompt = buildTeachingPrompt(question, context, promptOptions) + "\n\n" + sourcePrompt(request.source)
    // One deadline for the whole request: repair and transient retries share it,
    // so a struggling provider can't keep a student waiting for minutes.
    const deadline = Date.now() + config.requestTimeoutMs

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      const callResult = await this.callGeminiWithTransientRetry({
        apiKey,
        model: config.gemini.model,
        prompt,
        maxOutputTokens: config.maxOutputTokens,
        deadline,
        signal,
        // The question first (every box refers to it), then the student's working, if any.
        images: [request.source?.image, request.source?.work?.image].filter((image) => image !== undefined),
      })
      if (!callResult.ok) return callResult

      const parsed = parseTeachingPlanResponse(callResult.text)
      // A valid plan must also be visual: send it back once if it only talks, or describes a
      // graph without drawing it. On the last attempt a valid plan is used rather than failing.
      const visualIssue = parsed.ok ? visualPlanIssue(parsed.plan, question) : null
      if (parsed.ok && (!visualIssue || attempt === config.maxRetries)) {
        return { ok: true, plan: parsed.plan, usage: callResult.usage }
      }

      if (!parsed.ok && attempt === config.maxRetries) {
        return { ok: false, failure: { kind: "invalid_output", detail: parsed.error.message } }
      }
      prompt = buildRepairPrompt({
        question,
        context,
        options: promptOptions,
        invalidResponse: callResult.text,
        errorMessage: visualIssue ?? (parsed.ok ? "" : parsed.error.message),
      }) + "\n\n" + sourcePrompt(request.source)
    }

    return { ok: false, failure: { kind: "invalid_output", detail: "exhausted retries" } }
  }

  /**
   * The zoomed-in second look at a copied figure. Kept deliberately cheap:
   * one small image, a short prompt, minimal thinking, a short JSON answer,
   * a single attempt with no repair loop, and a short deadline - if it fails,
   * the lesson simply keeps the first guesses.
   */
  async locateParts(request: LocatePartsRequest, signal?: AbortSignal): Promise<LocatePartsResult> {
    const apiKey = this.options.config.gemini.apiKey
    if (!apiKey) return { ok: false, failure: { kind: "missing_api_key" } }
    const prompt = buildLocatePrompt(request.parts)
    const result = await this.callGemini({
      apiKey,
      model: this.options.config.gemini.model,
      prompt,
      maxOutputTokens: LOCATE_MAX_OUTPUT_TOKENS,
      deadline: Date.now() + LOCATE_TIMEOUT_MS,
      signal,
      images: [request.image],
      thinkingLevel: "minimal",
    })
    if (!result.ok) return result
    const parsed = parseLocateResponse(result.text, request.parts.map((p) => p.id))
    if (!parsed) return { ok: false, failure: { kind: "invalid_output", detail: "locate: unreadable answer" } }
    return { ok: true, ...parsed, usage: result.usage }
  }

  /**
   * Retries the raw network call itself (separate from the JSON-repair
   * retry above) on a flaky connection or a transient provider error
   * (e.g. Gemini's own "high demand" 503) - exactly the cases a second
   * attempt is actually likely to fix, bounded so a persistently broken
   * network still fails fast rather than hanging indefinitely.
   */
  private async callGeminiWithTransientRetry(
    args: Parameters<GeminiProvider["callGemini"]>[0]
  ): Promise<GeminiCallResult> {
    let lastResult: GeminiCallResult = await this.callGemini(args)

    for (let attempt = 0; attempt < MAX_TRANSIENT_RETRIES && !lastResult.ok; attempt++) {
      if (!isTransientFailure(lastResult.failure)) return lastResult
      if (args.signal?.aborted || Date.now() + TRANSIENT_RETRY_DELAY_MS >= args.deadline) return lastResult
      await delay(TRANSIENT_RETRY_DELAY_MS)
      const fallback = this.options.config.gemini.fallbackModel
      const overloaded = lastResult.failure.kind === "provider_error" &&
        [500, 502, 503, 504].includes(lastResult.failure.httpStatus ?? 0)
      if (overloaded && fallback) console.info(`[tutor] Switching from ${args.model} to ${fallback} after provider overload`)
      lastResult = await this.callGemini({
        ...args,
        model: overloaded && fallback ? fallback : args.model,
      })
    }

    return lastResult
  }

  private async callGemini(args: {
    apiKey: string
    model: string
    prompt: string
    maxOutputTokens: number
    /** Epoch ms by which this call must finish (shared across retries). */
    deadline: number
    signal?: AbortSignal
    images?: NonNullable<QuestionSource["image"]>[]
    /** Defaults to the teaching-plan settings; the parts locator asks for less thinking. */
    thinkingLevel?: "minimal" | "low" | "high"
  }): Promise<GeminiCallResult> {
    const images = args.images ?? []
    const remainingMs = args.deadline - Date.now()
    if (remainingMs <= 0) return { ok: false, failure: { kind: "timeout" } }
    const fetchImpl = this.options.fetchImpl ?? fetch
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), remainingMs)
    const onExternalAbort = () => controller.abort()
    args.signal?.addEventListener("abort", onExternalAbort)

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent`
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": args.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: args.prompt },
            ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } })),
          ] }],
          generationConfig: {
            maxOutputTokens: args.maxOutputTokens,
            temperature: 0.4,
            responseMimeType: "application/json",
            // Read images in full detail: locating a diagram's parts needs it. (Text-only requests pay nothing extra.)
            ...(images.length > 0 ? { mediaResolution: "MEDIA_RESOLUTION_HIGH" } : {}),
            // Gemini 3 uses thinkingLevel. Other configured model families
            // retain their provider defaults rather than receiving an invalid budget.
            ...(/^gemini-3[.-]/.test(args.model) ? {
              thinkingConfig: { thinkingLevel: args.thinkingLevel ?? this.options.config.gemini.thinkingLevel ?? "low" },
            } : {}),
          },
        }),
        signal: controller.signal,
      })

      if (response.status === 429) return { ok: false, failure: { kind: "rate_limited" } }
      if (!response.ok) {
        const bodyText = await response.text().catch(() => "")
        return {
          ok: false,
          failure: {
            kind: "provider_error",
            httpStatus: response.status,
            detail: `Gemini responded ${response.status}: ${bodyText.slice(0, 300)}`,
          },
        }
      }

      const json = (await response.json()) as GeminiGenerateContentResponse
      const blockReason = json.promptFeedback?.blockReason
      if (blockReason) {
        return { ok: false, failure: { kind: "provider_error", detail: `blocked: ${blockReason}` } }
      }

      const text = extractText(json)
      if (text === null) {
        return { ok: false, failure: { kind: "provider_error", detail: "Gemini response had no text content" } }
      }
      return { ok: true, text, usage: usageFrom(json, args.prompt, text) }
    } catch (error) {
      if (args.signal?.aborted) return { ok: false, failure: { kind: "cancelled" } }
      if (controller.signal.aborted) return { ok: false, failure: { kind: "timeout" } }
      return {
        ok: false,
        failure: {
          kind: "provider_error",
          detail: error instanceof Error
            ? `${error.message}${error.cause && typeof error.cause === "object" && "code" in error.cause ? ` (${String(error.cause.code)})` : ""}`
            : String(error),
        },
      }
    } finally {
      clearTimeout(timeoutHandle)
      args.signal?.removeEventListener("abort", onExternalAbort)
    }
  }
}
