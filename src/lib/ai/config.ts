/**
 * Server-side AI provider configuration, read from environment variables.
 *
 * This is the only place that reads `GEMINI_API_KEY` and friends. Never
 * import this module from client code - Next.js would otherwise happily
 * inline a server env var into a client bundle.
 */

export type AIProviderName = "gemini"

export interface AIConfig {
  provider: AIProviderName
  gemini: {
    apiKey: string | null
    model: string
    fallbackModel?: string | null
    thinkingLevel?: "minimal" | "low" | "high"
  }
  maxOutputTokens: number
  /** Hard ceiling on what one student prompt may cost in USD, across every call it makes. */
  maxCostPerPromptUsd: number
  maxRetries: number
  requestTimeoutMs: number
  rateLimit: {
    capacity: number
    refillPerSec: number
  }
  /** A Desmos API key is configured (DESMOS_KEY), so graphs can be drawn as live Desmos graphs. */
  desmos?: boolean
}

const DEFAULTS = {
  provider: "gemini" as const,
  geminiModel: "gemini-3.1-flash-lite",
  maxOutputTokens: 8192,
  maxCostPerPromptUsd: 0.03,
  maxRetries: 1,
  requestTimeoutMs: 45_000,
  rateLimitCapacity: 8,
  rateLimitRefillPerSec: 0.1,
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < 0) return fallback
  return value
}

function parsePositiveFloat(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return value
}

function nonEmpty(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  return trimmed ? trimmed : null
}

export function loadAIConfig(env: Record<string, string | undefined> = process.env): AIConfig {
  const provider: AIProviderName = env.AI_PROVIDER === "gemini" ? "gemini" : DEFAULTS.provider

  return {
    provider,
    gemini: {
      apiKey: nonEmpty(env.GEMINI_API_KEY),
      model: nonEmpty(env.GEMINI_MODEL) ?? DEFAULTS.geminiModel,
      fallbackModel: nonEmpty(env.GEMINI_FALLBACK_MODEL),
      thinkingLevel: env.GEMINI_THINKING_LEVEL === "high" ? "high" : env.GEMINI_THINKING_LEVEL === "minimal" ? "minimal" : "low",
    },
    maxOutputTokens: parsePositiveInt(env.AI_MAX_OUTPUT_TOKENS, DEFAULTS.maxOutputTokens),
    maxCostPerPromptUsd: parsePositiveFloat(env.AI_MAX_COST_PER_PROMPT_USD, DEFAULTS.maxCostPerPromptUsd),
    maxRetries: parseNonNegativeInt(env.AI_MAX_RETRIES, DEFAULTS.maxRetries),
    requestTimeoutMs: parsePositiveInt(env.AI_REQUEST_TIMEOUT_MS, DEFAULTS.requestTimeoutMs),
    rateLimit: {
      capacity: parsePositiveInt(env.AI_RATE_LIMIT_CAPACITY, DEFAULTS.rateLimitCapacity),
      refillPerSec: parsePositiveFloat(
        env.AI_RATE_LIMIT_REFILL_PER_SEC,
        DEFAULTS.rateLimitRefillPerSec
      ),
    },
    desmos: nonEmpty(env.DESMOS_KEY) !== null,
  }
}

export function isAIConfigured(config: AIConfig): boolean {
  if (config.provider === "gemini") return config.gemini.apiKey !== null
  return false
}
