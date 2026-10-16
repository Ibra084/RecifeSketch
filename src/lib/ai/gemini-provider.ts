import type { AIConfig } from "./config"
import { buildRepairPrompt, buildTeachingPrompt } from "./prompt"
import type { AIProvider, TeachingPlanFailure, TeachingPlanRequest, TeachingPlanResult } from "./provider"
import { isTransientFailure, MAX_TRANSIENT_RETRIES, TRANSIENT_RETRY_DELAY_MS } from "./retry"
import { parseTeachingPlanResponse } from "./response-parser"
import { estimateUsage, usageFromMeasuredTokens, type UsageEstimate } from "./usage-tracker"
import { sourcePrompt, type QuestionSource } from "./question-source"

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
    let prompt = buildTeachingPrompt(question, context) + "\n\n" + sourcePrompt(request.source)

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      const callResult = await this.callGeminiWithTransientRetry({
        apiKey,
        model: config.gemini.model,
        prompt,
        maxOutputTokens: config.maxOutputTokens,
        timeoutMs: config.requestTimeoutMs,
        signal,
        image: request.source?.image,
      })
      if (!callResult.ok) return callResult

      const parsed = parseTeachingPlanResponse(callResult.text)
      if (parsed.ok) {
        return { ok: true, plan: parsed.plan, usage: callResult.usage }
      }

      if (attempt === config.maxRetries) {
        return { ok: false, failure: { kind: "invalid_output", detail: parsed.error.message } }
      }
      prompt = buildRepairPrompt({
        question,
        context,
        invalidResponse: callResult.text,
        errorMessage: parsed.error.message,
      }) + "\n\n" + sourcePrompt(request.source)
    }

    return { ok: false, failure: { kind: "invalid_output", detail: "exhausted retries" } }
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
      if (args.signal?.aborted) return lastResult
      await delay(TRANSIENT_RETRY_DELAY_MS)
      lastResult = await this.callGemini(args)
    }

    return lastResult
  }

  private async callGemini(args: {
    apiKey: string
    model: string
    prompt: string
    maxOutputTokens: number
    timeoutMs: number
    signal?: AbortSignal
    image?: QuestionSource["image"]
  }): Promise<GeminiCallResult> {
    const fetchImpl = this.options.fetchImpl ?? fetch
    const controller = new AbortController()
    const timeoutHandle = setTimeout(() => controller.abort(), args.timeoutMs)
    const onExternalAbort = () => controller.abort()
    args.signal?.addEventListener("abort", onExternalAbort)

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:generateContent?key=${encodeURIComponent(args.apiKey)}`
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [
            { text: args.prompt },
            ...(args.image ? [{ inlineData: { mimeType: args.image.mimeType, data: args.image.data } }] : []),
          ] }],
          generationConfig: {
            maxOutputTokens: args.maxOutputTokens,
            temperature: 0.4,
            responseMimeType: "application/json",
            // Gemini 3 uses thinkingLevel. Other configured model families
            // retain their provider defaults rather than receiving an invalid budget.
            ...(/^gemini-3[.-]/.test(args.model) ? {
              thinkingConfig: { thinkingLevel: this.options.config.gemini.thinkingLevel ?? "low" },
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
          detail: error instanceof Error ? error.message : String(error),
        },
      }
    } finally {
      clearTimeout(timeoutHandle)
      args.signal?.removeEventListener("abort", onExternalAbort)
    }
  }
}
