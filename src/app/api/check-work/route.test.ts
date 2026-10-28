import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AIProvider } from "@/lib/ai/provider"
import { usageFromMeasuredTokens } from "@/lib/ai/usage-tracker"

const currentUser = vi.fn()
vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: () => currentUser() }))
vi.mock("@/lib/whiteboards/data", () => ({ isWhiteboardId: () => false, ownsWhiteboard: async () => false }))
vi.mock("@/lib/mistakes/data", () => ({ practiceForBoard: async () => null, recordPracticeResult: async () => undefined }))
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-secret")

const { handleCheckWork } = await import("./route")

const image = { mimeType: "image/png", data: "aGVsbG8gd29ybGQgaW1hZ2U=", width: 10, height: 10 }
const request = (body: unknown) => new Request("http://localhost/api/check-work", { method: "POST", body: JSON.stringify(body) })
const reading = (steps: string[], errorStep: number | null) => ({
  ok: true as const,
  usage: usageFromMeasuredTokens("gemini-3.1-flash-lite", 1, 1),
  reading: {
    readable: true, confidence: "high" as const, skill: "expand_brackets" as const,
    steps: steps.map((text) => ({ text, box: [100, 100, 200, 800] as [number, number, number, number] })),
    errorStep, concept: "Expanding brackets", misconception: "Only the first term was multiplied.",
    hint: "What does the 3 multiply?", explanation: "Both terms are multiplied.",
  },
})
const limiter = { tryConsume: () => true }

describe("POST /api/check-work", () => {
  beforeEach(() => currentUser.mockReset())

  it("refuses signed-out requests", async () => {
    currentUser.mockResolvedValue(null)
    const provider: AIProvider = { generateTeachingPlan: vi.fn(), checkWork: vi.fn() }
    const response = await handleCheckWork(request({ image }), { provider, limiter, isConfigured: true })
    expect(response.status).toBe(401)
    expect(provider.checkWork).not.toHaveBeenCalled()
  })

  it("TEST A end to end through the route: verified error, signed so it can be saved", async () => {
    currentUser.mockResolvedValue({ id: "student-a" })
    const provider: AIProvider = { generateTeachingPlan: vi.fn(), checkWork: vi.fn(async () => reading(["3(x + 2) = 3x + 2"], 0)) }
    const body = await (await handleCheckWork(request({ image }), { provider, limiter, isConfigured: true })).json()
    expect(body.verdict).toBe("mistake")
    expect(body.draft.correctRelationship).toBe("3(x + 2) = 3x + 6")
    expect(typeof body.saveToken).toBe("string")
  })

  it("TEST B end to end through the route: correct work, nothing to save", async () => {
    currentUser.mockResolvedValue({ id: "student-a" })
    const provider: AIProvider = { generateTeachingPlan: vi.fn(), checkWork: vi.fn(async () => reading(["3(x + 2) = 3x + 6"], null)) }
    const body = await (await handleCheckWork(request({ image }), { provider, limiter, isConfigured: true })).json()
    expect(body.verdict).toBe("correct")
    expect(body.saveToken).toBeUndefined()
  })

  it("TEST F: a failed reading is an honest 'not sure', never a correction", async () => {
    currentUser.mockResolvedValue({ id: "student-a" })
    const provider: AIProvider = { generateTeachingPlan: vi.fn(), checkWork: vi.fn(async () => ({ ok: false as const, failure: { kind: "invalid_output" as const, detail: "x" } })) }
    const body = await (await handleCheckWork(request({ image }), { provider, limiter, isConfigured: true })).json()
    expect(body.verdict).toBe("uncertain")
    expect(body.correction).toBeUndefined()
  })

  it("is rate limited per student", async () => {
    currentUser.mockResolvedValue({ id: "student-a" })
    const provider: AIProvider = { generateTeachingPlan: vi.fn(), checkWork: vi.fn() }
    const response = await handleCheckWork(request({ image }), { provider, limiter: { tryConsume: () => false }, isConfigured: true })
    expect(response.status).toBe(429)
    expect(provider.checkWork).not.toHaveBeenCalled()
  })
})
