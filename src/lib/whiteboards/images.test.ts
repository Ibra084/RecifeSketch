import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const { isImagePath } = await import("./images")

const uid = "0f8b7c2e-1d3a-4b5c-9e6f-7a8b9c0d1e2f"
const board = "b841a58d-8319-4f71-a609-f79dea640a19"
const file = "3c9e1f2a-4b5d-4e6f-8a7b-9c0d1e2f3a4b"

describe("isImagePath", () => {
  it("accepts exactly <user>/<board>/<file>.<image ext>", () => {
    expect(isImagePath(`${uid}/${board}/${file}.png`)).toBe(true)
    expect(isImagePath(`${uid}/${board}/${file}.JPG`)).toBe(true)
  })

  it("rejects traversal, extra segments, other extensions and anything else", () => {
    expect(isImagePath(`${uid}/../${board}/${file}.png`)).toBe(false)
    expect(isImagePath(`${uid}/${board}/x/${file}.png`)).toBe(false)
    expect(isImagePath(`${uid}/${board}/${file}.svg`)).toBe(false)
    expect(isImagePath(`${uid}/${board}/${file}.html`)).toBe(false)
    expect(isImagePath(`${uid}/${board}`)).toBe(false)
    expect(isImagePath(`${uid}/${board}/${file}.png?x=1`)).toBe(false)
    expect(isImagePath("")).toBe(false)
  })
})
