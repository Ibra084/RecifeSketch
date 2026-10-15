import type { AIConfig } from "./config"
import { buildRepairPrompt, buildTeachingPrompt } from "./prompt"
import type { AIProvider, TeachingPlanFailure, TeachingPlanRequest, TeachingPlanResult } from "./provider"
import { parseTeachingPlanResponse } from "./response-parser"
import { estimateUsage, usageFromMeasuredTokens, type UsageEstimate } from "./usage-tracker"

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
    return usageFromMeasuredTokens(promptTokenCount, candidatesTokenCount)
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
    let prompt = buildTeachingPrompt(question, context)

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      const callResult = await this.callGemini({
        apiKey,
        model: config.gemini.model,
        prompt,
        maxOutputTokens: config.maxOutputTokens,
        timeoutMs: config.requestTimeoutMs,
        signal,
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
        invalidResponse: callResult.text,
        errorMessage: parsed.error.message,
      })
    }

    return { ok: false, failure: { kind: "invalid_output", detail: "exhausted retries" } }
  }

  private async callGemini(args: {
    apiKey: string
    model: string
    prompt: string
    maxOutputTokens: number
    timeoutMs: number
    signal?: AbortSignal
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
          contents: [{ role: "user", parts: [{ text: args.prompt }] }],
          generationConfig: {
            maxOutputTokens: args.maxOutputTokens,
            temperature: 0.4,
            responseMimeType: "application/json",
            // Disabled: on thinking-capable models, "thinking" tokens are
            // drawn from the same maxOutputTokens budget as the visible
            // reply, so leaving it on risks the model spending the whole
            // budget reasoning and returning no text at all - and burning
            // cost on invisible output conflicts with this project's own
            // cost-minimization requirement. This task doesn't need deep
            // multi-step reasoning, just a competent drawing plan.
            thinkingConfig: { thinkingBudget: 0 },
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
