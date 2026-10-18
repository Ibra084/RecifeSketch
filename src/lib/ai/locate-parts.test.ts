import { describe, expect, it } from "vitest"
import { loadAIConfig } from "./config"
import { GeminiProvider } from "./gemini-provider"
import { parseLocateResponse } from "./locate-parts"

describe("parseLocateResponse", () => {
  it("keeps only requested parts with sensible boxes, clamped to the image", () => {
    const raw = JSON.stringify({
      figure: [10, 20, 990, 1200],
      parts: [
        { id: "mass_3kg", box: [700, 100, 900, 300] },
        { id: "mass_2kg", box: [700, 600, 650, 800] }, // ymax < ymin: dropped
        { id: "stranger", box: [0, 0, 100, 100] }, // not asked for: dropped
        "garbage",
      ],
    })
    expect(parseLocateResponse(raw, ["mass_3kg", "mass_2kg"])).toEqual({
      figure: [10, 20, 990, 1000],
      parts: [{ id: "mass_3kg", box: [700, 100, 900, 300] }],
    })
  })

  it("returns null for an unreadable answer", () => {
    expect(parseLocateResponse("not json", ["a"])).toBeNull()
  })
})

describe("GeminiProvider.locateParts", () => {
  it("is one small request: minimal thinking, capped output, the cropped figure only", async () => {
    const bodies: { contents: { parts: Record<string, unknown>[] }[]; generationConfig: Record<string, unknown> }[] = []
    const provider = new GeminiProvider({ config: loadAIConfig({ GEMINI_API_KEY: "k" }), fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      const answer = { figure: [0, 0, 1000, 1000], parts: [{ id: "pulley", box: [10, 300, 200, 700] }] }
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }], usageMetadata: { promptTokenCount: 1300, candidatesTokenCount: 40 } }))
    } })
    const image = { mimeType: "image/png" as const, data: "cropped-figure", width: 300, height: 400 }
    const result = await provider.locateParts({ image, parts: [{ id: "pulley", guess: [0, 250, 250, 750] }] })
    expect(result.ok && result.parts).toEqual([{ id: "pulley", box: [10, 300, 200, 700] }])
    expect(bodies).toHaveLength(1)
    expect(bodies[0].generationConfig.maxOutputTokens).toBe(600)
    expect(bodies[0].generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" })
    expect(bodies[0].contents[0].parts.filter((p) => p.inlineData)).toHaveLength(1)
  })
})
