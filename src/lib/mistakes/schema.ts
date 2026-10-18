import { z } from "zod"
import { SKILLS, type Skill } from "./math-check"

/**
 * Shapes shared by the check-work route, the provider and the browser.
 * Subject is part of every record so other subjects can be added later; the
 * MVP only checks maths.
 */

export const SUBJECTS = ["maths"] as const
export type Subject = (typeof SUBJECTS)[number]

const imageBox = z.tuple([z.number(), z.number(), z.number(), z.number()])
  .transform((b) => b.map((v) => Math.min(1000, Math.max(0, v))) as [number, number, number, number])
  .refine(([ymin, xmin, ymax, xmax]) => ymax > ymin && xmax > xmin)

const text = (max: number) => z.string().catch("").transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max))

/** What the AI reads from the student's working. Lenient: odd fields are blanked, never fatal. */
export const checkWorkModelSchema = z.object({
  readable: z.boolean().catch(false),
  confidence: z.enum(["high", "medium", "low"]).catch("low"),
  skill: z.enum([...SKILLS, "other"]).catch("other"),
  steps: z.array(z.object({ text: z.string().max(200), box: imageBox.optional().catch(undefined) })).max(12).catch([]),
  errorStep: z.number().int().min(0).nullable().catch(null),
  concept: text(80),
  misconception: text(240),
  hint: text(300),
  explanation: text(400),
})
export type CheckWorkModelOutput = z.infer<typeof checkWorkModelSchema>

/** A mistake ready to be saved (only ever produced for a verified error). */
export interface MistakeDraft {
  subject: Subject
  skill: Skill
  concept: string
  misconception: string
  incorrectStep: string
  correctRelationship: string
  hint: string
  sourceBoardId: string | null
}

export type CheckVerdict = "mistake" | "correct" | "unfinished" | "uncertain"

/** What the student is shown after "Check my work". */
export interface CheckWorkResult {
  verdict: CheckVerdict
  /** Box (0-1000 of the checked image) around the step this is about, when known. */
  box?: [number, number, number, number]
  /** One short line, shown first. */
  headline: string
  /** A nudge that doesn't give the answer away. */
  hint?: string
  /** The correct relationship, revealed only when the student asks for it. */
  correction?: string
  /** Present only for a mistake both the AI and the maths checker agree on. */
  draft?: MistakeDraft
  saveToken?: string
  /** When checking a practice question: what was recorded. */
  practice?: "correct" | "incorrect" | "unfinished" | "unverified"
}

export const PRACTICE_STATUSES = ["not_practised", "needs_practice", "practised"] as const
export type PracticeStatus = (typeof PRACTICE_STATUSES)[number]

export interface MistakeRecord extends MistakeDraft {
  id: string
  practiceStatus: PracticeStatus
  practiceAttempts: number
  lastPractisedAt: string | null
  createdAt: string
}
