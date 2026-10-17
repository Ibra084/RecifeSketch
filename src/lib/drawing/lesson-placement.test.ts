import { describe, expect, it } from "vitest"
import type { DrawingAction } from "./protocol"
import { nearestClearOffset, placeLesson, type Obstacle } from "./lesson-placement"

const intersects = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

// The student's selected working, and the tutor's first answer about it (drawn to its right, notes beside that).
const working: Obstacle = { x: 0, y: 0, w: 400, h: 300, annotatable: true }
const firstAnswer: Obstacle[] = [
  { x: 440, y: 0, w: 400, h: 300, annotatable: false }, // its diagram
  { x: 888, y: 0, w: 460, h: 260, annotatable: false }, // its notes column
]

/** The answer the model plans every time it's asked about this working: "right beside the selection". */
function answerBesideWorking(): { actions: DrawingAction[] }[] {
  return [
    {
      actions: [
        { type: "create_shape", id: "box", shape: "rectangle", x: 440, y: 0, w: 400, h: 300 },
        { type: "write_text", id: "note", position: { x: 860, y: 0 }, text: "First, subtract 3 from both sides of the equation." },
      ],
    },
    {
      actions: [
        { type: "draw_arrow", id: "pointer", start: { x: 440, y: 150 }, end: { x: 380, y: 150 } }, // points at the working
        { type: "create_shape", id: "circle-step", shape: "ellipse", x: 20, y: 40, w: 200, h: 60 }, // circles a line of it
        { type: "mark_image", id: "mark", box: [100, 100, 200, 200] },
        { type: "draw_force", id: "weight", on: "box", angle: 270, label: "W" },
      ],
    },
  ]
}

const actionsOf = (steps: { actions: DrawingAction[] }[]) =>
  Object.fromEntries(steps.flatMap((s) => s.actions).flatMap((a) => ("id" in a ? [[a.id, a]] : [])))

describe("placeLesson", () => {
  it("leaves a lesson alone when it already lands in clear space", () => {
    const steps = answerBesideWorking()
    const placed = placeLesson(steps, [working])
    expect(placed.steps).toBe(steps)
    expect([placed.dx, placed.dy]).toEqual([0, 0])
  })

  it("moves a second answer on the same target off the first one, into clear space", () => {
    const placed = placeLesson(answerBesideWorking(), [working, ...firstAnswer])
    expect([placed.dx, placed.dy]).not.toEqual([0, 0])
    const a = actionsOf(placed.steps)
    const box = a.box as Extract<DrawingAction, { type: "create_shape" }>
    const moved = { x: box.x, y: box.y, w: box.w, h: box.h }
    for (const obstacle of [working, ...firstAnswer]) expect(intersects(moved, obstacle)).toBe(false)
    // The lesson keeps its own layout: the note moved by exactly the same amount as the diagram.
    const note = a.note as Extract<DrawingAction, { type: "write_text" }>
    expect(note.position).toEqual({ x: 860 + placed.dx, y: 0 + placed.dy })
  })

  it("keeps marks that sit on the student's work in place, and the arrow's head on it", () => {
    const placed = placeLesson(answerBesideWorking(), [working, ...firstAnswer])
    const a = actionsOf(placed.steps)
    expect(a["circle-step"]).toEqual(actionsOf(answerBesideWorking())["circle-step"])
    const arrow = a.pointer as Extract<DrawingAction, { type: "draw_arrow" }>
    expect(arrow.end).toEqual({ x: 380, y: 150 }) // still pointing at the working
    expect(arrow.start).toEqual({ x: 440 + placed.dx, y: 150 + placed.dy }) // tail travels with the lesson
  })

  it("never moves things placed relative to the question image or to other objects", () => {
    const placed = placeLesson(answerBesideWorking(), [working, ...firstAnswer])
    const before = actionsOf(answerBesideWorking())
    const a = actionsOf(placed.steps)
    expect(a.mark).toEqual(before.mark)
    expect(a.weight).toEqual(before.weight)
  })

  it("does use the space above, below or to the left - whichever is nearest", () => {
    // Everything to the right is taken, far out; there's room just below.
    const wall: Obstacle = { x: 440, y: -2000, w: 4000, h: 2300, annotatable: false }
    const placed = placeLesson(answerBesideWorking(), [working, wall])
    expect(placed.dy).toBeGreaterThan(0)
    expect(Math.abs(placed.dx)).toBeLessThan(Math.abs(placed.dy))
  })
})

describe("nearestClearOffset", () => {
  it("finds the nearest gap around a block", () => {
    const block = { x: 0, y: 0, w: 100, h: 100 }
    expect(nearestClearOffset(block, [])).toEqual({ dx: 0, dy: 0 })
    const offset = nearestClearOffset(block, [{ x: -50, y: -50, w: 200, h: 200 }])!
    const moved = { x: offset.dx - 40, y: offset.dy - 40, w: 180, h: 180 }
    expect(intersects(moved, { x: -50, y: -50, w: 200, h: 200 })).toBe(false)
    expect(Math.hypot(offset.dx, offset.dy)).toBeLessThanOrEqual(240)
  })
})
