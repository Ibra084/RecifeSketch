import { describe, expect, it } from "vitest"
import { createRateLimiter } from "./rate-limiter"

function fakeClock(startMs = 0) {
  let now = startMs
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe("createRateLimiter", () => {
  it("allows requests up to the bucket capacity", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ capacity: 3, refillPerSec: 1, now: clock.now })

    expect(limiter.tryConsume("a")).toBe(true)
    expect(limiter.tryConsume("a")).toBe(true)
    expect(limiter.tryConsume("a")).toBe(true)
  })

  it("rejects a request once the bucket is empty", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ capacity: 2, refillPerSec: 1, now: clock.now })

    expect(limiter.tryConsume("a")).toBe(true)
    expect(limiter.tryConsume("a")).toBe(true)
    expect(limiter.tryConsume("a")).toBe(false)
  })

  it("refills tokens over time", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ capacity: 1, refillPerSec: 1, now: clock.now })

    expect(limiter.tryConsume("a")).toBe(true)
    expect(limiter.tryConsume("a")).toBe(false)

    clock.advance(1000)
    expect(limiter.tryConsume("a")).toBe(true)
  })

  it("never refills past the bucket capacity", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ capacity: 2, refillPerSec: 1, now: clock.now })

    clock.advance(10_000)
    expect(limiter.tryConsume("a")).toBe(true)
    expect(limiter.tryConsume("a")).toBe(true)
    expect(limiter.tryConsume("a")).toBe(false)
  })

  it("tracks separate buckets per key", () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ capacity: 1, refillPerSec: 1, now: clock.now })

    expect(limiter.tryConsume("a")).toBe(true)
    expect(limiter.tryConsume("b")).toBe(true)
    expect(limiter.tryConsume("a")).toBe(false)
    expect(limiter.tryConsume("b")).toBe(false)
  })
})
