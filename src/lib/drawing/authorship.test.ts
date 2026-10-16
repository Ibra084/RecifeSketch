import { describe, expect, it } from "vitest"
import { AI_AUTHORED_META, focusedStudentWork, isStudentShape } from "./authorship"

const shape = (meta: Record<string, unknown> = {}, type = "draw") => ({ type, meta })

describe("isStudentShape", () => {
  it("treats a plain hand-drawn shape as the student's", () => {
    expect(isStudentShape(shape())).toBe(true)
  })

  it("excludes anything the tutor authored", () => {
    expect(isStudentShape(shape({ [AI_AUTHORED_META]: true }))).toBe(false)
    expect(isStudentShape(shape({ recifeObjectId: "core" }))).toBe(false)
    expect(isStudentShape(shape({ recifeLabelOwner: "shape:core" }, "text"))).toBe(false)
  })

  it("excludes an attached past-paper question (it's already sent separately)", () => {
    expect(isStudentShape(shape({ recifeQuestionSource: true }, "image"))).toBe(false)
  })
})

describe("focusedStudentWork", () => {
  const student = (id: string) => ({ id, type: "draw", meta: {} })
  const tutor = (id: string) => ({ id, type: "geo", meta: { [AI_AUTHORED_META]: true } })

  it("prefers the student's own selected shapes", () => {
    const ids = focusedStudentWork({ selected: [student("a"), tutor("t")], visible: [student("a"), student("b")], all: [student("a"), student("b"), student("c")] })
    expect(ids.map((s) => s.id)).toEqual(["a"])
  })

  it("otherwise uses the student's work currently in view", () => {
    const ids = focusedStudentWork({ selected: [tutor("t")], visible: [student("b"), tutor("t")], all: [student("a"), student("b")] })
    expect(ids.map((s) => s.id)).toEqual(["b"])
  })

  it("falls back to all student work when none of it is in view", () => {
    const ids = focusedStudentWork({ selected: [], visible: [], all: [student("a"), tutor("t")] })
    expect(ids.map((s) => s.id)).toEqual(["a"])
  })
})
