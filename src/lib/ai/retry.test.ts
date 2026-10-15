import { describe, expect, it } from "vitest"
import { isTransientFailure } from "./retry"

describe("isTransientFailure", () => {
  it("treats a timeout as transient", () => {
    expect(isTransientFailure({ kind: "timeout" })).toBe(true)
  })

  it("treats a provider_error as transient", () => {
    expect(isTransientFailure({ kind: "provider_error", detail: "503" })).toBe(true)
  })

  it("does not retry a missing api key", () => {
    expect(isTransientFailure({ kind: "missing_api_key" })).toBe(false)
  })

  it("does not retry a rate limit", () => {
    expect(isTransientFailure({ kind: "rate_limited" })).toBe(false)
  })

  it("does not retry a user cancellation", () => {
    expect(isTransientFailure({ kind: "cancelled" })).toBe(false)
  })

  it("does not retry invalid model output", () => {
    expect(isTransientFailure({ kind: "invalid_output", detail: "bad json" })).toBe(false)
  })
})
