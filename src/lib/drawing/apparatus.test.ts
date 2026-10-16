import { describe, expect, it } from "vitest"
import { APPARATUS_KINDS, APPARATUS_SHAPE, buildApparatus, placeApparatus } from "./apparatus"

const extent = (parts: ReturnType<typeof buildApparatus>, role?: string) => {
  const pts = parts.filter((p) => !role || p.role === role).flatMap((p) => p.points)
  return {
    minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)),
  }
}

describe("buildApparatus", () => {
  it.each(APPARATUS_KINDS)("%s stays within its stated size, with every point a real number", (kind) => {
    const h = 200
    const w = h * APPARATUS_SHAPE[kind].widthRatio
    const parts = buildApparatus(kind, 100, 50, { height: h, fill: 0.5, lit: true })
    expect(parts.length).toBeGreaterThan(0)
    for (const part of parts) for (const p of part.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    const e = extent(parts)
    const lip = w * 0.15 + 6 // spouts and rims may overhang slightly
    expect(e.minX).toBeGreaterThanOrEqual(100 - lip)
    expect(e.maxX).toBeLessThanOrEqual(100 + w + lip)
    expect(e.minY).toBeGreaterThanOrEqual(50 - h * 0.1)
    expect(e.maxY).toBeLessThanOrEqual(50 + h + 0.5)
  })

  it.each(APPARATUS_KINDS.filter((k) => APPARATUS_SHAPE[k].holdsLiquid && k !== "thermometer"))("%s keeps its liquid inside its walls", (kind) => {
    const parts = buildApparatus(kind, 0, 0, { height: 200, fill: 0.6 })
    const body = extent(parts, "body")
    const liquid = extent(parts, "liquid")
    expect(liquid.minX).toBeGreaterThan(body.minX)
    expect(liquid.maxX).toBeLessThan(body.maxX)
    expect(liquid.maxY).toBeLessThanOrEqual(body.maxY)
  })

  it("fills a beaker to the level asked for, and draws no liquid when empty", () => {
    const half = extent(buildApparatus("beaker", 0, 0, { height: 200, fill: 0.5 }), "liquid")
    expect(half.minY).toBeCloseTo(200 - 190 * 0.5)
    expect(buildApparatus("beaker", 0, 0, { height: 200 }).some((p) => p.role === "liquid")).toBe(false)
  })

  it("only draws a Bunsen flame when the burner is lit", () => {
    expect(buildApparatus("bunsen_burner", 0, 0, { lit: true }).some((p) => p.role === "flame")).toBe(true)
    expect(buildApparatus("bunsen_burner", 0, 0).some((p) => p.role === "flame")).toBe(false)
  })
})

describe("placeApparatus", () => {
  const tripod = { x: 0, y: 300, w: 133, h: 140 }
  it("sits a beaker centred on top of the gauze", () => {
    const at = placeApparatus("beaker", 100, tripod, "on")
    expect(at.y + 100).toBe(300) // base on the gauze
    expect(at.x + 40).toBeCloseTo(tripod.x + tripod.w / 2) // centred (beaker is 80 wide)
  })
  it("stands a thermometer inside a beaker, near its bottom", () => {
    const beaker = { x: 0, y: 0, w: 144, h: 180 }
    const at = placeApparatus("thermometer", 220, beaker, "inside")
    expect(at.y + 220).toBeLessThan(180)
    expect(at.y + 220).toBeGreaterThan(160)
  })
})
