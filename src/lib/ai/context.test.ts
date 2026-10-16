import { describe, expect, it } from "vitest"
import {
  existingIdsFrom,
  formatContextForPrompt,
  MAX_CONTEXT_OBJECTS,
  MAX_HISTORY_TURNS,
  tutorContextSchema,
  type ObjectSummary,
  type TutorContext,
} from "./context"

function sampleObject(overrides: Partial<ObjectSummary> = {}): ObjectSummary {
  return { id: "primary-coil", kind: "shape", label: "Primary coil", x: 0, y: 0, w: 100, h: 50, ...overrides }
}

describe("tutorContextSchema", () => {
  it("provides occupied student areas and a fresh topic area even without AI history", () => {
    const context = tutorContextSchema.parse({ objects: [], history: [], layout: {
      viewport: { x: 0, y: 0, w: 1000, h: 700 },
      occupied: [{ x: 0, y: 0, w: 600, h: 400 }],
      freshArea: { x: 760, y: 0, w: 1000, h: 700 },
    } })
    const prompt = formatContextForPrompt(context)
    expect(prompt).toContain('"x":760')
    expect(prompt).toContain("student work")
    expect(prompt).toContain("never the entire accumulated board")
  })
  it("accepts an empty context", () => {
    expect(tutorContextSchema.safeParse({ objects: [], history: [] }).success).toBe(true)
  })

  it("accepts a well-formed context with objects and history", () => {
    const context: TutorContext = {
      objects: [sampleObject()],
      history: [{ question: "Explain transformers", concept: "Transformers", explanation: "Done." }],
    }
    expect(tutorContextSchema.safeParse(context).success).toBe(true)
  })

  it("rejects more objects than the cap", () => {
    const objects = Array.from({ length: MAX_CONTEXT_OBJECTS + 1 }, (_, i) => sampleObject({ id: `o${i}` }))
    expect(tutorContextSchema.safeParse({ objects, history: [] }).success).toBe(false)
  })

  it("rejects more history turns than the cap", () => {
    const history = Array.from({ length: MAX_HISTORY_TURNS + 1 }, () => ({
      question: "q",
      concept: "c",
      explanation: "l",
    }))
    expect(tutorContextSchema.safeParse({ objects: [], history }).success).toBe(false)
  })

  it("rejects an object with an invalid id charset", () => {
    expect(
      tutorContextSchema.safeParse({ objects: [sampleObject({ id: "bad id!" })], history: [] }).success
    ).toBe(false)
  })

  it("rejects unknown fields on an object summary", () => {
    const bad = { ...sampleObject(), extra: "nope" }
    expect(tutorContextSchema.safeParse({ objects: [bad], history: [] }).success).toBe(false)
  })
})

describe("existingIdsFrom", () => {
  it("returns an empty array for undefined context", () => {
    expect(existingIdsFrom(undefined)).toEqual([])
  })

  it("returns every object id in order", () => {
    const context: TutorContext = {
      objects: [sampleObject({ id: "a" }), sampleObject({ id: "b" })],
      history: [],
    }
    expect(existingIdsFrom(context)).toEqual(["a", "b"])
  })
})

describe("formatContextForPrompt", () => {
  it("returns an empty string for undefined context", () => {
    expect(formatContextForPrompt(undefined)).toBe("")
  })

  it("returns an empty string when there are no objects and no history", () => {
    expect(formatContextForPrompt({ objects: [], history: [] })).toBe("")
  })

  it("includes each object's exact id so the model can copy it verbatim", () => {
    const text = formatContextForPrompt({ objects: [sampleObject({ id: "primary-coil" })], history: [] })
    expect(text).toContain("primary-coil")
  })

  it("includes each history turn's question and concept", () => {
    const text = formatContextForPrompt({
      objects: [],
      history: [{ question: "Why does it need AC?", concept: "Transformers", explanation: "Flux changes." }],
    })
    expect(text).toContain("Why does it need AC?")
    expect(text).toContain("Transformers")
  })

  it("frames a new question as a follow-up that builds on the steps already shown", () => {
    const text = formatContextForPrompt({
      objects: [],
      history: [{ question: "Find a", concept: "Pulleys", explanation: "1. Forces on A. 2. Forces on B." }],
    })
    expect(text).toContain("1. Forces on A. 2. Forces on B.")
    expect(text).toMatch(/Treat the new question as a follow-up/)
    expect(text).toMatch(/continue from the last step they saw/)
  })

  it("remembers whole explanations (all the steps), not just one sentence", () => {
    const long = "x".repeat(1200)
    expect(tutorContextSchema.safeParse({ objects: [], history: [{ question: "q", concept: "c", explanation: long }] }).success).toBe(true)
  })

  it("instructs the model to reuse existing ids rather than invent new ones", () => {
    const text = formatContextForPrompt({ objects: [sampleObject()], history: [] }).toLowerCase()
    expect(text).toMatch(/reuse|exact id|existing/)
  })
})


describe("selection", () => {
  const selection = {
    region: { x: 100, y: 200, w: 300, h: 120 },
    objects: [
      { id: "eq2", kind: "equation", label: "x^2-4=0", bounds: { x: 100, y: 200, w: 300, h: 50 } },
      { kind: "handwriting", bounds: { x: 100, y: 260, w: 200, h: 60 } },
    ],
  }
  it("tells the model the question is about the selected items, by id where it has one", () => {
    const text = formatContextForPrompt({ objects: [], history: [], selection })
    expect(text).toMatch(/SELECTED PART OF THE BOARD/)
    expect(text).toContain('- eq2: equation "x^2-4=0"')
    expect(text).toContain("handwriting")
  })
  it("puts the response right beside the selection", () => {
    expect(formatContextForPrompt({ objects: [], history: [], selection })).toContain("x=440, y=200")
  })
  it("accepts a selection in the request and rejects an empty one", () => {
    expect(tutorContextSchema.safeParse({ objects: [], history: [], selection }).success).toBe(true)
    expect(tutorContextSchema.safeParse({ objects: [], history: [], selection: { ...selection, objects: [] } }).success).toBe(false)
  })
})
