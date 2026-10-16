import { describe, expect, it } from "vitest"
import { computeNiceTicks, evaluateExpression, mapPointsToCanvas, sampleFunction } from "./plotting"

describe("evaluateExpression", () => {
  it("evaluates the bare variable x", () => {
    expect(evaluateExpression("x", 5)).toBe(5)
  })

  it("evaluates addition", () => {
    expect(evaluateExpression("2 + 3", 0)).toBe(5)
  })

  it("evaluates exponentiation with the variable", () => {
    expect(evaluateExpression("x^2", 3)).toBe(9)
  })

  it("evaluates a call to sin", () => {
    expect(evaluateExpression("sin(0)", 0)).toBeCloseTo(0, 10)
  })

  it("respects operator precedence and parentheses", () => {
    expect(evaluateExpression("2 * (x + 1)", 3)).toBe(8)
  })

  it("evaluates unary minus", () => {
    expect(evaluateExpression("-x", 4)).toBe(-4)
  })

  it("evaluates the constant pi", () => {
    expect(evaluateExpression("pi", 0)).toBeCloseTo(Math.PI, 10)
  })

  it("throws a clear error for an unknown identifier", () => {
    expect(() => evaluateExpression("banana(x)", 1)).toThrow(/unknown/i)
  })

  it("throws a clear error for mismatched parentheses", () => {
    expect(() => evaluateExpression("(2 + 3", 0)).toThrow()
  })

  it("throws a clear error for an empty expression", () => {
    expect(() => evaluateExpression("", 0)).toThrow()
  })

  it("never uses eval or the Function constructor", () => {
    // Guards against a future regression that'd reopen an arbitrary-code hole.
    const originalFunction = globalThis.Function
    let constructed = false
    class TrapFunction extends Function {
      constructor(...args: unknown[]) {
        constructed = true
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super(...(args as any))
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).Function = TrapFunction
    try {
      evaluateExpression("sin(x) * 2 + 1", 1)
    } finally {
      globalThis.Function = originalFunction
    }
    expect(constructed).toBe(false)
  })
})

describe("sampleFunction", () => {
  it("samples a quadratic across evenly spaced points", () => {
    const points = sampleFunction("x^2", [-2, 2], 5)
    expect(points.map((p) => p.x)).toEqual([-2, -1, 0, 1, 2])
    expect(points.map((p) => p.y)).toEqual([4, 1, 0, 1, 4])
  })

  it("drops non-finite samples instead of throwing", () => {
    const points = sampleFunction("1/x", [-1, 1], 3)
    // x = -1, 0, 1 -> y = -1, Infinity, 1: the x=0 sample must be dropped.
    expect(points.map((p) => p.x)).toEqual([-1, 1])
  })

  it("throws when every sample in the domain is non-finite", () => {
    expect(() => sampleFunction("1/0", [-1, 1], 3)).toThrow(/finite/i)
  })
})

describe("mapPointsToCanvas", () => {
  it("maps math-space points to canvas-space with position offset and scale", () => {
    const result = mapPointsToCanvas(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      { position: { x: 100, y: 100 }, scale: { x: 10, y: 10 } }
    )
    expect(result).toEqual([
      { x: 100, y: 100 },
      { x: 110, y: 90 },
    ])
  })
})

describe("computeNiceTicks", () => {
  it("includes zero when the range straddles it", () => {
    const ticks = computeNiceTicks(-6.28, 6.28, 5)
    expect(ticks).toContain(0)
  })

  it("produces evenly spaced, round-number ticks", () => {
    const ticks = computeNiceTicks(0, 100, 5)
    expect(ticks).toEqual([0, 20, 40, 60, 80, 100])
  })

  it("produces sensible ticks for a small fractional range", () => {
    const ticks = computeNiceTicks(0, 1, 5)
    expect(ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1])
  })

  it("never produces a tick outside [min, max]", () => {
    const ticks = computeNiceTicks(-6.28, 6.28, 5)
    for (const tick of ticks) {
      expect(tick).toBeGreaterThanOrEqual(-6.28)
      expect(tick).toBeLessThanOrEqual(6.28)
    }
  })

  it("handles a range that does not straddle zero", () => {
    const ticks = computeNiceTicks(10, 20, 5)
    expect(ticks).toEqual([10, 12, 14, 16, 18, 20])
  })

  it("returns a single tick for a degenerate zero-width range", () => {
    expect(computeNiceTicks(5, 5, 5)).toEqual([5])
  })

  it("returns ticks sorted in ascending order", () => {
    const ticks = computeNiceTicks(-6.28, 6.28, 5)
    const sorted = [...ticks].sort((a, b) => a - b)
    expect(ticks).toEqual(sorted)
  })

  it("never returns floating-point noise like 0.30000000000000004", () => {
    const ticks = computeNiceTicks(0, 0.9, 5)
    for (const tick of ticks) {
      expect(tick.toString().length).toBeLessThan(10)
    }
  })
})

describe("absolute value", () => {
  it("plots |x| bars the same as abs()", () => {
    expect(evaluateExpression("|x - 2| - 1", -3)).toBe(4)
    expect(evaluateExpression("abs(x - 2) - 1", -3)).toBe(4)
    expect(evaluateExpression("2*|x| + |x - 1|", -1)).toBe(4)
  })
})
