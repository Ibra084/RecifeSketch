import { describe, expect, it } from "vitest"
import { DrawingEngine } from "../engine"
import { FakeDrawingAdapter } from "../fake-adapter"
import type { DrawingAction } from "../protocol"
import { DrawingPlayer } from "./player"
import type { PlaybackClock, PlaybackSnapshot } from "./types"

function shapeAction(id: string): DrawingAction {
  return { type: "create_shape", id, shape: "rectangle", x: 0, y: 0, w: 10, h: 10 }
}

/** Lets pending microtask chains (awaits already-resolved promises) settle. */
async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** Resolves a promise the first time a subscriber-observed snapshot matches `predicate`. */
function waitForSnapshot(
  player: DrawingPlayer,
  predicate: (snapshot: PlaybackSnapshot) => boolean,
  onMatch?: () => void
): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = player.subscribe((snapshot) => {
      if (predicate(snapshot)) {
        onMatch?.()
        unsubscribe()
        resolve()
      }
    })
  })
}

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

describe("DrawingPlayer", () => {
  it("announces each step before that step's first action executes", async () => {
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({ engine: new DrawingEngine(adapter), baseStepPauseMs: 0 })
    const announced: { step: number; calls: number }[] = []
    let last = -1
    player.subscribe((snapshot) => {
      if (snapshot.state === "drawing" && snapshot.stepIndex !== last) {
        last = snapshot.stepIndex
        announced.push({ step: last, calls: adapter.calls.length })
      }
    })
    await player.play([{ actions: [shapeAction("a")] }, { actions: [shapeAction("b")] }])
    expect(announced).toEqual([{ step: 0, calls: 0 }, { step: 1, calls: 1 }])
  })

  it("reports cancellation during the last action instead of completed", async () => {
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({ engine: new DrawingEngine(adapter) })
    player.subscribe((snapshot) => {
      if (snapshot.state === "drawing" && snapshot.actionIndex === 1) player.cancel()
    })
    await player.play([{ actions: [shapeAction("a")] }])
    expect(player.getSnapshot().state).toBe("cancelled")
    expect(adapter.getObjectBounds("a")).toBeDefined()
  })

  it("starts idle", () => {
    const player = new DrawingPlayer({ engine: new DrawingEngine(new FakeDrawingAdapter()) })
    expect(player.getSnapshot().state).toBe("idle")
  })

  it("runs a simple one-step sequence through to completed", async () => {
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({ engine: new DrawingEngine(adapter) })

    await player.play([{ actions: [shapeAction("a")] }])

    expect(player.getSnapshot().state).toBe("completed")
    expect(adapter.calls).toHaveLength(1)
  })

  it("executes every action across multiple steps, in order", async () => {
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({ engine: new DrawingEngine(adapter) })

    await player.play([
      { actions: [shapeAction("a"), shapeAction("b")] },
      { actions: [shapeAction("c")] },
    ])

    expect(adapter.calls.map((call) => (call as { action: { id: string } }).action.id)).toEqual([
      "a",
      "b",
      "c",
    ])
  })

  it("emits preparing then drawing then completed, in that order", async () => {
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({ engine: new DrawingEngine(adapter) })
    const states: string[] = []
    player.subscribe((snapshot) => states.push(snapshot.state))

    await player.play([{ actions: [shapeAction("a")] }])

    // The player also emits a progress snapshot after each action (same
    // state, advanced actionIndex) - dedupe consecutive repeats since this
    // test only cares about the state transitions themselves.
    const transitions = states.filter((state, i) => state !== states[i - 1])
    expect(transitions).toEqual(["preparing", "drawing", "completed"])
  })

  it("waits the configured pause between steps before starting the next one", async () => {
    const { clock, advance } = createFakeClock()
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({
      engine: new DrawingEngine(adapter),
      baseStepPauseMs: 100,
      clock,
    })

    const promise = player.play([
      { actions: [shapeAction("a")] },
      { actions: [shapeAction("b")] },
    ])

    await flush()
    expect(adapter.calls).toHaveLength(1)

    advance(50)
    await flush()
    expect(adapter.calls).toHaveLength(1)

    advance(60)
    await flush()
    await promise
    expect(adapter.calls).toHaveLength(2)
  })

  it("scales the inter-step pause by the configured speed", async () => {
    const { clock, advance } = createFakeClock()
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({
      engine: new DrawingEngine(adapter),
      baseStepPauseMs: 100,
      speed: 2,
      clock,
    })

    const promise = player.play([
      { actions: [shapeAction("a")] },
      { actions: [shapeAction("b")] },
    ])

    await flush()
    advance(60)
    await flush()
    await promise
    expect(adapter.calls).toHaveLength(2)
  })

  it("pauses between actions and resumes from exactly where it left off", async () => {
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({ engine: new DrawingEngine(adapter) })

    const pausedAt = waitForSnapshot(
      player,
      (snapshot) => snapshot.actionIndex === 2,
      () => player.pause()
    )

    const promise = player.play([{ actions: [shapeAction("a"), shapeAction("b"), shapeAction("c")] }])

    await pausedAt
    await flush()
    expect(player.getSnapshot().state).toBe("paused")
    expect(adapter.calls).toHaveLength(2)

    player.resume()
    await promise

    expect(player.getSnapshot().state).toBe("completed")
    expect(adapter.calls).toHaveLength(3)
  })

  it("cancels cleanly, keeping already-drawn objects and never running later actions", async () => {
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({ engine: new DrawingEngine(adapter) })

    const cancelledAt = waitForSnapshot(
      player,
      (snapshot) => snapshot.actionIndex === 2,
      () => player.cancel()
    )

    const promise = player.play([{ actions: [shapeAction("a"), shapeAction("b"), shapeAction("c")] }])

    await cancelledAt
    await promise

    expect(player.getSnapshot().state).toBe("cancelled")
    expect(adapter.calls).toHaveLength(2)
  })

  it("enters the error state and stops when an action fails, without hanging", async () => {
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({ engine: new DrawingEngine(adapter) })

    await player.play([
      {
        actions: [
          shapeAction("a"),
          { type: "move_object", id: "ghost", position: { x: 1, y: 1 } },
          shapeAction("b"),
        ],
      },
    ])

    const snapshot = player.getSnapshot()
    expect(snapshot.state).toBe("error")
    expect(snapshot.error?.action.type).toBe("move_object")
    expect(adapter.calls.filter((c) => c.method === "createShape")).toHaveLength(1)
  })

  it("reports a bounded, consistent snapshot shape throughout playback", async () => {
    const adapter = new FakeDrawingAdapter()
    const player = new DrawingPlayer({ engine: new DrawingEngine(adapter) })
    const snapshots: PlaybackSnapshot[] = []
    player.subscribe((snapshot) => snapshots.push(snapshot))

    await player.play([{ actions: [shapeAction("a"), shapeAction("b")] }])

    expect(snapshots.every((s) => s.totalActions === 2)).toBe(true)
    expect(snapshots.at(-1)?.actionIndex).toBe(2)
  })

  it("holds after each step until the student moves on, and never after the last step", async () => {
    const adapter = new FakeDrawingAdapter()
    const gates: { step: number; release: () => void }[] = []
    const player = new DrawingPlayer({
      engine: new DrawingEngine(adapter),
      waitBetweenSteps: (step) => new Promise<void>((release) => gates.push({ step, release })),
    })
    const done = player.play([{ actions: [shapeAction("a")] }, { actions: [shapeAction("b")] }])
    await flush()
    expect(adapter.calls).toHaveLength(1)
    expect(gates.map((g) => g.step)).toEqual([0])
    gates[0].release()
    await done
    expect(adapter.calls).toHaveLength(2)
    expect(gates).toHaveLength(1)
    expect(player.getSnapshot().state).toBe("completed")
  })

  it("cancels while waiting for the student, aborting the gate", async () => {
    const adapter = new FakeDrawingAdapter()
    let aborted = false
    const player = new DrawingPlayer({
      engine: new DrawingEngine(adapter),
      waitBetweenSteps: (_step, signal) => new Promise<void>((release) => signal.addEventListener("abort", () => { aborted = true; release() })),
    })
    const done = player.play([{ actions: [shapeAction("a")] }, { actions: [shapeAction("b")] }])
    await flush()
    player.cancel()
    await done
    expect(aborted).toBe(true)
    expect(player.getSnapshot().state).toBe("cancelled")
    expect(adapter.calls).toHaveLength(1)
  })
})
