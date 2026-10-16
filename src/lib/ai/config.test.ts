import { describe, expect, it } from "vitest"
import { isAIConfigured, loadAIConfig } from "./config"

describe("loadAIConfig", () => {
  it("falls back to defaults when no env vars are set", () => {
    const config = loadAIConfig({})

    expect(config.provider).toBe("gemini")
    expect(config.gemini.apiKey).toBeNull()
    expect(config.gemini.model).toBe("gemini-3.1-flash-lite")
    expect(config.maxOutputTokens).toBeGreaterThan(0)
    expect(config.maxRetries).toBeGreaterThanOrEqual(0)
    expect(config.requestTimeoutMs).toBeGreaterThan(0)
    expect(config.rateLimit.capacity).toBeGreaterThan(0)
    expect(config.rateLimit.refillPerSec).toBeGreaterThan(0)
  })

  it("reads the Gemini API key and model from env", () => {
    const config = loadAIConfig({
      GEMINI_API_KEY: "  test-key-123  ",
      GEMINI_MODEL: "gemini-custom-model",
    })

    expect(config.gemini.apiKey).toBe("test-key-123")
    expect(config.gemini.model).toBe("gemini-custom-model")
  })

  it("treats an empty-string API key as not configured", () => {
    const config = loadAIConfig({ GEMINI_API_KEY: "   " })
    expect(config.gemini.apiKey).toBeNull()
  })

  it("reads numeric overrides from env", () => {
    const config = loadAIConfig({
      AI_MAX_OUTPUT_TOKENS: "2048",
      AI_MAX_RETRIES: "3",
      AI_REQUEST_TIMEOUT_MS: "5000",
      AI_RATE_LIMIT_CAPACITY: "20",
      AI_RATE_LIMIT_REFILL_PER_SEC: "2.5",
    })

    expect(config.maxOutputTokens).toBe(2048)
    expect(config.maxRetries).toBe(3)
    expect(config.requestTimeoutMs).toBe(5000)
    expect(config.rateLimit.capacity).toBe(20)
    expect(config.rateLimit.refillPerSec).toBe(2.5)
  })

  it("ignores invalid numeric overrides and falls back to defaults", () => {
    const defaults = loadAIConfig({})
    const config = loadAIConfig({
      AI_MAX_OUTPUT_TOKENS: "not-a-number",
      AI_MAX_RETRIES: "-5",
      AI_REQUEST_TIMEOUT_MS: "0",
    })

    expect(config.maxOutputTokens).toBe(defaults.maxOutputTokens)
    expect(config.maxRetries).toBe(defaults.maxRetries)
    expect(config.requestTimeoutMs).toBe(defaults.requestTimeoutMs)
  })

  it("allows AI_PROVIDER to be overridden", () => {
    const config = loadAIConfig({ AI_PROVIDER: "gemini" })
    expect(config.provider).toBe("gemini")
  })
})

describe("isAIConfigured", () => {
  it("is false when the active provider has no API key", () => {
    expect(isAIConfigured(loadAIConfig({}))).toBe(false)
  })

  it("is true when the active provider has an API key", () => {
    expect(isAIConfigured(loadAIConfig({ GEMINI_API_KEY: "key" }))).toBe(true)
  })
})

describe("Desmos availability", () => {
  it("is on only when DESMOS_KEY is set (the key itself is not part of the AI config)", () => {
    expect(loadAIConfig({ DESMOS_KEY: "abc" }).desmos).toBe(true)
    expect(loadAIConfig({ DESMOS_KEY: "  " }).desmos).toBe(false)
    expect(JSON.stringify(loadAIConfig({ DESMOS_KEY: "secret-key" }))).not.toContain("secret-key")
  })
})
