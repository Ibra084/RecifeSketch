import "server-only"
import { z } from "zod"
import { requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { createWhiteboard, isWhiteboardId, ownsWhiteboard } from "@/lib/whiteboards/data"
import { SKILLS } from "./math-check"
import { generatePractice, type PracticeQuestion } from "./practice"
import { verifySaveToken } from "./save-token"
import { PRACTICE_STATUSES, SUBJECTS, type MistakeDraft, type MistakeRecord, type PracticeStatus } from "./schema"

/**
 * Mistake Memory data access. Every function resolves the signed-in student
 * and filters on their id; row-level security enforces the same rule in the
 * database, so one student can never read or change another's mistakes.
 */

const draftSchema = z.strictObject({
  subject: z.enum(SUBJECTS),
  skill: z.enum(SKILLS),
  concept: z.string().min(1).max(80),
  misconception: z.string().min(1).max(240),
  incorrectStep: z.string().min(1).max(200),
  correctRelationship: z.string().min(1).max(240),
  hint: z.string().min(1).max(300),
  sourceBoardId: z.string().nullable(),
})

const practiceQuestionSchema = z.strictObject({
  skill: z.enum(SKILLS),
  prompt: z.string().max(120),
  start: z.string().max(120),
  answer: z.string().max(120),
})

interface Row {
  id: string
  subject: MistakeDraft["subject"]
  skill: MistakeDraft["skill"]
  concept: string
  misconception: string
  incorrect_step: string
  correct_relationship: string
  hint: string
  source_board_id: string | null
  practice_status: PracticeStatus
  practice_attempts: number
  last_practised_at: string | null
  created_at: string
}

/** Mistake ids are UUIDs, like board ids. */
const isId = isWhiteboardId

const COLUMNS = "id, subject, skill, concept, misconception, incorrect_step, correct_relationship, hint, source_board_id, practice_status, practice_attempts, last_practised_at, created_at"

const toRecord = (row: Row): MistakeRecord => ({
  id: row.id,
  subject: row.subject,
  skill: row.skill,
  concept: row.concept,
  misconception: row.misconception,
  incorrectStep: row.incorrect_step,
  correctRelationship: row.correct_relationship,
  hint: row.hint,
  sourceBoardId: row.source_board_id,
  practiceStatus: PRACTICE_STATUSES.includes(row.practice_status) ? row.practice_status : "not_practised",
  practiceAttempts: row.practice_attempts,
  lastPractisedAt: row.last_practised_at,
  createdAt: row.created_at,
})

/** The student's saved mistakes, newest first. Null if the feature's table isn't set up yet. */
export async function listMistakes(): Promise<MistakeRecord[] | null> {
  const user = await requireUser()
  const { data, error } = await (await createClient())
    .from("mistakes")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) {
    console.warn("[mistakes] list failed (is the migration applied?):", error.code, error.message)
    return null
  }
  return (data as Row[]).map(toRecord)
}

/** Saves a verified mistake. Refuses anything not signed by "Check my work" for this student. */
export async function saveMistake(input: unknown, token: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await requireUser()
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success || typeof token !== "string" || !verifySaveToken(user.id, parsed.data, token)) {
    return { ok: false, error: "This mistake can't be saved - check your work again first." }
  }
  const draft = parsed.data
  // Only link a board the student actually owns.
  const sourceBoardId = draft.sourceBoardId && (await ownsWhiteboard(draft.sourceBoardId)) ? draft.sourceBoardId : null
  const { data, error } = await (await createClient())
    .from("mistakes")
    .insert({
      user_id: user.id,
      subject: draft.subject,
      skill: draft.skill,
      concept: draft.concept,
      misconception: draft.misconception,
      incorrect_step: draft.incorrectStep,
      correct_relationship: draft.correctRelationship,
      hint: draft.hint,
      source_board_id: sourceBoardId,
    })
    .select("id")
    .single()
  if (error) {
    console.error("[mistakes] save failed:", error.code, error.message)
    return { ok: false, error: "Couldn't save it right now. Please try again." }
  }
  return { ok: true, id: data.id as string }
}

export async function deleteMistake(id: string): Promise<boolean> {
  if (!isId(id)) return false
  const user = await requireUser()
  const { data, error } = await (await createClient()).from("mistakes").delete().eq("id", id).eq("user_id", user.id).select("id")
  return !error && data.length > 0
}

/**
 * Starts (or resumes) practice on a mistake: a new question for the same
 * skill, on its own practice whiteboard. Returns that board's id.
 */
export async function startPractice(id: string): Promise<string | null> {
  if (!isId(id)) return null
  const user = await requireUser()
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("mistakes")
    .select("id, skill, concept, incorrect_step, practice_board_id, practice_status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle()
  if (error || !row) return null

  const question = generatePractice(row.skill, row.incorrect_step)
  const boardId = await createWhiteboard(`Practice: ${row.concept}`.slice(0, 80))
  const { error: updateError } = await supabase
    .from("mistakes")
    .update({ practice_question: question, practice_board_id: boardId })
    .eq("id", id)
    .eq("user_id", user.id)
  if (updateError) {
    console.error("[mistakes] practice start failed:", updateError.message)
    return null
  }
  return boardId
}

/** The practice question attached to a board, if this board is a practice board of the student's. */
export async function practiceForBoard(boardId: string): Promise<{ mistakeId: string; question: PracticeQuestion } | null> {
  if (!isWhiteboardId(boardId)) return null
  const user = await requireUser()
  const { data, error } = await (await createClient())
    .from("mistakes")
    .select("id, practice_question")
    .eq("practice_board_id", boardId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (error || !data) return null
  const question = practiceQuestionSchema.safeParse(data.practice_question)
  return question.success ? { mistakeId: data.id as string, question: question.data } : null
}

/** Records the result of a checked practice attempt. Unverifiable attempts change nothing. */
export async function recordPracticeResult(mistakeId: string, result: "correct" | "incorrect" | "unfinished" | "unverified"): Promise<void> {
  if (result === "unverified" || result === "unfinished") return
  const user = await requireUser()
  const supabase = await createClient()
  const { data } = await supabase.from("mistakes").select("practice_attempts").eq("id", mistakeId).eq("user_id", user.id).maybeSingle()
  if (!data) return
  await supabase
    .from("mistakes")
    .update({
      practice_status: result === "correct" ? "practised" : "needs_practice",
      practice_attempts: (data.practice_attempts as number) + 1,
      last_practised_at: new Date().toISOString(),
    })
    .eq("id", mistakeId)
    .eq("user_id", user.id)
}
