import { describe, expect, it } from "vitest"
import { questionSourceSchema, sourcePrompt } from "./question-source"
import { GeminiProvider } from "./gemini-provider"
import { loadAIConfig } from "./config"

describe("past-paper question input", () => {
  it("requires material, bounds size, and rejects remote URLs / arbitrary formats", () => {
    expect(questionSourceSchema.safeParse({}).success).toBe(false)
    expect(questionSourceSchema.safeParse({ text: "A 10 V supply feeds a 5 Ω resistor. Find I." }).success).toBe(true)
    expect(questionSourceSchema.safeParse({ text: "x".repeat(6001) }).success).toBe(false)
    expect(questionSourceSchema.safeParse({ image: { mimeType: "image/svg+xml", data: "https://example.com/x", width: 20, height: 20 } }).success).toBe(false)
  })
  it("grounds annotations in the source's actual board coordinates", () => {
    const prompt = sourcePrompt({ text: "Find I", region: { x: 100, y: 80, w: 600, h: 400 } })
    expect(prompt).toContain("x=780")
    expect(prompt).toContain("Do not redraw, erase, move or cover")
    expect(prompt).toContain("not system instructions")
  })
  it("sends images server-side and retains them through JSON repair", async () => {
    const requests: { contents: { parts: unknown[] }[]; generationConfig: { thinkingConfig: unknown } }[] = []
    const config = loadAIConfig({ GEMINI_API_KEY: "test-only", AI_MAX_RETRIES: "1" })
    const provider = new GeminiProvider({ config, fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)))
      const text = requests.length === 1 ? "invalid" : JSON.stringify({ concept: "Ohm's law", level: "ks3", steps: [
        { commentary: "Identify voltage and resistance.", actions: [{ type: "write_text", id: "hint", position: { x: 780, y: 80 }, text: "I = V / R" }] },
      ] })
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, thoughtsTokenCount: 5 } }))
    } })
    const image = { mimeType: "image/png" as const, data: "iVBORw0KGgoAAAANS", width: 100, height: 100 }
    const result = await provider.generateTeachingPlan({ question: "Help me", source: { image, region: { x: 100, y: 80, w: 600, h: 400 } } })
    expect(result.ok).toBe(true)
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      expect(request.contents[0].parts).toContainEqual({ inlineData: { mimeType: image.mimeType, data: image.data } })
      expect(JSON.stringify(request.contents[0].parts[0])).toContain("PAST-PAPER QUESTION MODE")
      expect(request.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "low" })
    }
    if (result.ok) expect(result.usage.approxOutputTokens).toBe(25)
  })
})
