"use client"

import { useCallback, useRef, useState } from "react"
import type { TLShapeId } from "tldraw"
import { MAX_HISTORY_TURNS, type PriorTurn, type TutorContext } from "@/lib/ai/context"
import { playbackCommentary } from "@/lib/ai/playback-history"
import type { QuestionSource } from "@/lib/ai/question-source"
import { toDrawingSequence, type TeachingPlan } from "@/lib/ai/teaching-protocol"
import type { UsageEstimate } from "@/lib/ai/usage-tracker"
import type { PlaybackSnapshot } from "@/lib/drawing/playback/types"
import type { TrackedObjectSummary } from "@/lib/drawing/tldraw-adapter"

export type TutorPhase = "idle" | "thinking" | "drawing"

/** Safety net above the server's own deadline (AI_REQUEST_TIMEOUT_MS, 45s by default). */
const CLIENT_TIMEOUT_MS = 60_000

/** A short status line shown beside the companion (errors, acknowledgements) - not a chat log. */
export interface TutorNote {
  id: number
  text: string
  variant?: "error"
}

type TutorResponse =
  | { ok: true; plan: TeachingPlan; usage: UsageEstimate }
  | { ok: false; error: { code: string; message: string } }

export interface WhiteboardController {
  isReady(): boolean
  /** Plays a sequence; step commentary is spoken beside the orb by the controller. */
  play(sequence: ReturnType<typeof toDrawingSequence>, stepCommentary: string[]): Promise<PlaybackSnapshot>
  cancel(): void
  getVisualObjects(): TrackedObjectSummary[]
  getLayout(): TutorContext["layout"]
  placeQuestion(source: QuestionSource): TLShapeId
  questionBounds(id: TLShapeId): QuestionSource["region"]
  findUnattachedQuestionImage(): TLShapeId | undefined
  exportQuestionImage(id: TLShapeId): Promise<QuestionSource["image"]>
  /** Snapshot of the student's own work (plus `alsoInclude`), or undefined if there is none. */
  captureStudentWork(alsoInclude: TLShapeId[]): Promise<QuestionSource | undefined>
}

export function useTutor(board: WhiteboardController) {
  const [phase, setPhase] = useState<TutorPhase>("idle")
  const [note, setNote] = useState<TutorNote | null>(null)
  const noteIdRef = useRef(0)
  // A short rolling history of prior turns, sent back compact on every request.
  const historyRef = useRef<PriorTurn[]>([])
  const sourceRef = useRef<{ source: QuestionSource; id: TLShapeId } | null>(null)
  const [hasQuestionSource, setHasQuestionSource] = useState(false)
  const requestRef = useRef<AbortController | null>(null)
  const lastQuestionRef = useRef("")

  const say = useCallback((text: string, variant?: "error") => {
    setNote({ id: ++noteIdRef.current, text, variant })
  }, [])
  const dismissNote = useCallback(() => setNote(null), [])

  const ask = useCallback(
    async (rawQuestion: string, attached?: QuestionSource) => {
      const question = rawQuestion.trim()
      if (!question || phase !== "idle") return
      lastQuestionRef.current = question
      setNote(null)

      if (!board.isReady()) {
        say("The whiteboard isn't ready yet - try again in a moment.", "error")
        return
      }

      if (attached) {
        try {
          sourceRef.current = { source: { ...attached, kind: "question" }, id: board.placeQuestion(attached) }
          setHasQuestionSource(true)
        } catch {
          say("Couldn't place the question on the board. Please try again.", "error")
          return
        }
      } else if (!sourceRef.current) {
        // A question image pasted straight onto the canvas, never shared yet.
        const pastedId = board.findUnattachedQuestionImage()
        if (pastedId) {
          try {
            const image = await board.exportQuestionImage(pastedId)
            sourceRef.current = { source: { image, kind: "question" }, id: pastedId }
            setHasQuestionSource(true)
          } catch {
            // Fall through: the student-work snapshot below may still cover it.
          }
        }
      }

      setPhase("thinking")
      const stored = sourceRef.current
      let source: QuestionSource | undefined
      try {
        // The student's own handwriting/sketches take priority: that's what "where did I go wrong?" is about.
        source = await board.captureStudentWork(stored ? [stored.id] : [])
      } catch {
        source = undefined
      }
      if (!source && stored) {
        const region = board.questionBounds(stored.id)
        if (region) source = { ...stored.source, region }
      }

      const context: TutorContext = { objects: board.getVisualObjects(), history: historyRef.current, layout: board.getLayout() }

      let json: TutorResponse
      const controller = new AbortController()
      requestRef.current = controller
      const timeout = window.setTimeout(() => controller.abort("timeout"), CLIENT_TIMEOUT_MS)
      try {
        const response = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, context, source }),
          signal: controller.signal,
        })
        json = (await response.json()) as TutorResponse
      } catch {
        setPhase("idle")
        if (controller.signal.reason === "timeout") say("The AI tutor took too long to respond. Please try again.", "error")
        else if (controller.signal.aborted) say("Stopped. Ask again whenever you're ready.")
        else say("I couldn't reach the AI tutor. Check your connection and try again.", "error")
        return
      } finally {
        window.clearTimeout(timeout)
        requestRef.current = null
      }

      if (!json.ok) {
        setPhase("idle")
        say(json.error.message, "error")
        return
      }

      const plan = json.plan
      const commentary = plan.steps.map((step) => step.commentary)
      setPhase("drawing")
      try {
        const outcome = await board.play(toDrawingSequence(plan), commentary)
        historyRef.current = [
          ...historyRef.current,
          { question, concept: plan.concept, lastCommentary: playbackCommentary(plan, outcome) },
        ].slice(-MAX_HISTORY_TURNS)
        if (outcome.state === "error") {
          say("I couldn't finish that drawing. Ask me to correct or continue it.", "error")
        } else if (outcome.state === "cancelled") {
          say("Stopped. Everything already drawn is still editable.")
        }
      } catch {
        say("The drawing was interrupted unexpectedly. Check the board before continuing.", "error")
      } finally {
        setPhase("idle")
      }
    },
    [board, phase, say]
  )

  // Stops whichever phase is running: the pending request while thinking, or the playback while drawing.
  const cancel = useCallback(() => {
    requestRef.current?.abort("user")
    board.cancel()
  }, [board])

  return {
    phase,
    note,
    dismissNote,
    ask,
    retry: () => { if (lastQuestionRef.current) void ask(lastQuestionRef.current) },
    cancel,
    hasQuestionSource,
    clearQuestionSource: () => {
      sourceRef.current = null
      setHasQuestionSource(false)
    },
  }
}
