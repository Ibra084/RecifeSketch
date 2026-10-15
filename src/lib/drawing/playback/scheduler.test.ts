import { describe, expect, it, vi } from "vitest"
import { runSteppedAnimation, wait } from "./scheduler"
import type { PlaybackClock } from "./types"

function createFakeClock() {
  let now = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  let nextId = 1

  const clock: PlaybackClock = {
    now: () => now,
    setTimeout: (callback, ms) => {
      const id = nextId++
      timers.set(id, { at: now + ms, callback })
      return id
    },
    clearTimeout: (handle) => {
      timers.delete(handle)
    },
    requestFrame: (callback) => {
      const id = nextId++
      timers.set(id, { at: now + 1, callback: () => callback(now) })
      return id
    },
    cancelFrame: (handle) => {
      timers.delete(handle)
    },
  }

  function advance(ms: number) {
    const target = now + ms
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)
      if (due.length === 0) break
      const [id, timer] = due[0]
      timers.delete(id)
      now = timer.at
      timer.callback()
    }
    now = target
  }

  return { clock, advance }
}

describe("wait", () => {
  it("resolves after the given duration on the provided clock", async () => {
    const { clock, advance } = createFakeClock()
    const controller = new AbortController()

    let resolved = false
    const promise = wait(100, controller.signal, clock).then(() => {
      resolved = true
    })

    advance(50)
    await Promise.resolve()
    expect(resolved).toBe(false)

    advance(50)
    await promise
    expect(resolved).toBe(true)
  })

  it("resolves immediately if the signal is already aborted", async () => {
    const { clock } = createFakeClock()
    const controller = new AbortController()
    controller.abort()

    const start = clock.now()
    await wait(10_000, controller.signal, clock)
    expect(clock.now()).toBe(start)
  })

  it("resolves immediately once the signal is aborted mid-wait", async () => {
    const { clock, advance } = createFakeClock()
    const controller = new AbortController()

    let resolved = false
    const promise = wait(1000, controller.signal, clock).then(() => {
      resolved = true
    })

    advance(10)
    controller.abort()
    await promise
    expect(resolved).toBe(true)
  })
})

describe("runSteppedAnimation", () => {
  it("calls onFrame once per step, marking only the last as final", async () => {
    const { clock, advance } = createFakeClock()
    const controller = new AbortController()
    const frames: { index: number; isFinal: boolean }[] = []

    const promise = runSteppedAnimation({
      steps: 4,
      durationMs: 40,
      signal: controller.signal,
      clock,
      onFrame: (index, isFinal) => frames.push({ index, isFinal }),
    })

    advance(1000)
    await promise

    expect(frames).toEqual([
      { index: 0, isFinal: false },
      { index: 1, isFinal: false },
      { index: 2, isFinal: false },
      { index: 3, isFinal: true },
    ])
  })

  it("jumps straight to the final frame when the signal is already aborted", async () => {
    const { clock } = createFakeClock()
    const controller = new AbortController()
    controller.abort()
    const frames: { index: number; isFinal: boolean }[] = []

    await runSteppedAnimation({
      steps: 5,
      durationMs: 500,
      signal: controller.signal,
      clock,
      onFrame: (index, isFinal) => frames.push({ index, isFinal }),
    })

    expect(frames).toEqual([{ index: 4, isFinal: true }])
  })

  it("jumps to the final frame immediately once aborted mid-animation", async () => {
    const { clock, advance } = createFakeClock()
    const controller = new AbortController()
    const frames: { index: number; isFinal: boolean }[] = []

    const promise = runSteppedAnimation({
      steps: 10,
      durationMs: 1000,
      signal: controller.signal,
      clock,
      onFrame: (index, isFinal) => frames.push({ index, isFinal }),
    })

    advance(150)
    controller.abort()
    await promise

    expect(frames.at(-1)).toEqual({ index: 9, isFinal: true })
    expect(frames.length).toBeLessThan(10)
  })

  it("calls onFrame exactly once, as final, when steps is 1", async () => {
    const { clock } = createFakeClock()
    const controller = new AbortController()
    const frames: { index: number; isFinal: boolean }[] = []

    await runSteppedAnimation({
      steps: 1,
      durationMs: 500,
      signal: controller.signal,
      clock,
      onFrame: (index, isFinal) => frames.push({ index, isFinal }),
    })

    expect(frames).toEqual([{ index: 0, isFinal: true }])
  })

  it("never calls onFrame after resolving (no stray late frames)", async () => {
    const { clock, advance } = createFakeClock()
    const controller = new AbortController()
    const onFrame = vi.fn()

    const promise = runSteppedAnimation({ steps: 3, durationMs: 30, signal: controller.signal, clock, onFrame })
    advance(1000)
    await promise
    const callsAtCompletion = onFrame.mock.calls.length

    advance(1000)
    expect(onFrame.mock.calls.length).toBe(callsAtCompletion)
  })
})
