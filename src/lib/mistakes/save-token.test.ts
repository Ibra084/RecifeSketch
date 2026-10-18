import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { MistakeDraft } from "./schema"

vi.mock("server-only", () => ({}))
const { issueSaveToken, verifySaveToken } = await import("./save-token")

const draft: MistakeDraft = {
  subject: "maths",
  skill: "expand_brackets",
  concept: "Expanding brackets",
  misconception: "Only the first term was multiplied.",
  incorrectStep: "3(x + 2) = 3x + 2",
  correctRelationship: "3(x + 2) = 3x + 6",
  hint: "Multiply every term inside the bracket.",
  sourceBoardId: null,
}

describe("save tokens: only a verified mistake can be saved, by the student it was found for", () => {
  beforeAll(() => vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-secret"))
  afterAll(() => vi.unstubAllEnvs())

  it("accepts the token issued for this student and this exact draft", () => {
    const token = issueSaveToken("student-a", draft)
    expect(verifySaveToken("student-a", draft, token)).toBe(true)
  })

  it("TEST E: rejects another student using it, or an edited draft", () => {
    const token = issueSaveToken("student-a", draft)
    expect(verifySaveToken("student-b", draft, token)).toBe(false)
    expect(verifySaveToken("student-a", { ...draft, misconception: "Something made up" }, token)).toBe(false)
  })

  it("rejects forged, malformed and expired tokens", () => {
    expect(verifySaveToken("student-a", draft, "123.forged")).toBe(false)
    expect(verifySaveToken("student-a", draft, "nonsense")).toBe(false)
    const old = issueSaveToken("student-a", draft, Date.now() - 2 * 24 * 60 * 60 * 1000)
    expect(verifySaveToken("student-a", draft, old)).toBe(false)
  })
})
