/**
 * A simple per-key token-bucket rate limiter.
 *
 * Used to cap how often a single client (keyed by IP, since this app has
 * no auth) can call the AI tutor endpoint. The bucket starts full so a
 * burst of a few requests is fine, then refills slowly - cheap protection
 * against accidental hammering or a runaway client loop, not a substitute
 * for a real gateway-level limiter in front of a production deployment.
 */

export interface RateLimiterOptions {
  capacity: number
  refillPerSec: number
  now?: () => number
}

export interface RateLimiter {
  tryConsume(key: string): boolean
}

interface Bucket {
  tokens: number
  lastRefillMs: number
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { capacity, refillPerSec } = options
  const now = options.now ?? (() => Date.now())
  const buckets = new Map<string, Bucket>()

  return {
    tryConsume(key: string): boolean {
      const nowMs = now()
      const bucket = buckets.get(key) ?? { tokens: capacity, lastRefillMs: nowMs }

      const elapsedSec = Math.max(0, nowMs - bucket.lastRefillMs) / 1000
      const refilled = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec)

      if (refilled < 1) {
        buckets.set(key, { tokens: refilled, lastRefillMs: nowMs })
        return false
      }

      buckets.set(key, { tokens: refilled - 1, lastRefillMs: nowMs })
      return true
    },
  }
}
