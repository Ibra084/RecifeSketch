"use client"

import { useCallback, useRef, useState } from "react"
import { MAX_HISTORY_TURNS, type PriorTurn, type TutorContext } from "@/lib/ai/context"
import { toDrawingSequence, type TeachingPlan } from "@/lib/ai/teaching-protocol"
import type { UsageEstimate } from "@/lib/ai/usage-tracker"
import type { TrackedObjectSummary } from "@/lib/drawing/tldraw-adapter"
import type { PlaybackSnapshot } from "@/lib/drawing/playback/types"
import { playbackCommentary } from "@/lib/ai/playback-history"
import type { QuestionSource } from "@/lib/ai/question-source"
import type { TLShapeId } from "tldraw"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  /** Set when this message reports a failure, so it can be styled distinctly from a normal reply. */
  variant?: "error"
}

interface TutorSuccessResponse {
  ok: true
  plan: TeachingPlan
  usage: UsageEstimate
}
interface TutorFailureResponse {
  ok: false
  error: { code: string; message: string }
}
type TutorResponse = TutorSuccessResponse | TutorFailureResponse

export interface WhiteboardController {
  placeQuestion(source: QuestionSource): TLShapeId
  questionBounds(id: TLShapeId): QuestionSource["region"]
  isReady(): boolean
  /**
   * Plays a sequence, calling `onStepStart` once each time a new step
   * begins drawing. `stepCommentary[i]` is step i's teaching commentary -
   * used to show a floating label near wherever the AI is currently
   * drawing, not just in the chat transcript.
   */
  play(
    sequence: ReturnType<typeof toDrawingSequence>,
    stepCommentary: (string | undefined)[],
    onStepStart: (stepIndex: number) => void
  ): Promise<PlaybackSnapshot>
  cancel(): void
  /** A compact snapshot of AI-created objects still live on the board, for follow-up context. */
  getVisualObjects(): TrackedObjectSummary[]
  /** An image the student pasted/dropped directly onto the board that hasn't been shared with the AI yet. */
  findUnattachedQuestionImage(): TLShapeId | undefined
  /** Exports a board shape (e.g. a pasted image) as a question-source image and marks it as shared. */
  exportQuestionImage(id: TLShapeId): Promise<QuestionSource["image"]>
}

function createId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const UNREACHABLE_MESSAGE =
  "I couldn't reach the AI tutor. Check your connection and try again."
const NOT_READY_MESSAGE = "The whiteboard isn't ready yet - please try again in a moment."

export function useTutorChat(board: WhiteboardController) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isWaitingForPlan, setIsWaitingForPlan] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  // A short rolling history of prior turns, kept client-side and sent back
  // compact on every request - never the full chat transcript.
  const historyRef = useRef<PriorTurn[]>([])
  const sourceRef = useRef<{ source: QuestionSource; id: TLShapeId } | null>(null)
  const [hasQuestionSource, setHasQuestionSource] = useState(false)

  const appendAssistantMessage = useCallback((content: string, variant?: "error") => {
    setMessages((prev) => [...prev, { id: createId(), role: "assistant", content, variant }])
  }, [])

  const sendMessage = useCallback(
    async (content: string, source?: QuestionSource) => {
      const trimmed = content.trim()
      if (!trimmed || isWaitingForPlan || isDrawing) return

      setMessages((prev) => [...prev, { id: createId(), role: "user", content: trimmed }])

      if (!board.isReady()) {
        appendAssistantMessage(NOT_READY_MESSAGE, "error")
        return
      }

      if (source) {
        try { sourceRef.current = { source, id: board.placeQuestion(source) }; setHasQuestionSource(true) }
        catch { appendAssistantMessage("Couldn't place the question on the board. Please try again.", "error"); return }
      } else if (!sourceRef.current) {
        // The student may have pasted/dropped a question image straight onto
        // the board (tldraw's own gesture) instead of using "Add past-paper
        // question" - without this, the AI would have no idea it exists.
        const unattachedId = board.findUnattachedQuestionImage()
        if (unattachedId) {
          try {
            const image = await board.exportQuestionImage(unattachedId)
            sourceRef.current = { source: { image }, id: unattachedId }
            setHasQuestionSource(true)
            appendAssistantMessage("I can see the question you placed on the board - let's work through it.")
          } catch {
            // Couldn't export it (e.g. an unsupported asset) - fall back to
            // answering without vision rather than blocking the question.
          }
        }
      }
      const storedSource = sourceRef.current
      const region = storedSource ? board.questionBounds(storedSource.id) : undefined
      const activeSource = storedSource && region ? { ...storedSource.source, region } : undefined

      const context: TutorContext = { objects: board.getVisualObjects(), history: historyRef.current }

      setIsWaitingForPlan(true)
      let json: TutorResponse
      try {
        const response = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, context, source: activeSource }),
        })
        json = (await response.json()) as TutorResponse
      } catch {
        setIsWaitingForPlan(false)
        appendAssistantMessage(UNREACHABLE_MESSAGE, "error")
        return
      }
      setIsWaitingForPlan(false)

      if (!json.ok) {
        appendAssistantMessage(json.error.message, "error")
        return
      }

      const plan = json.plan
      const sequence = toDrawingSequence(plan)
      const commentaryByStep = plan.steps.map((step) => step.commentary)
      setIsDrawing(true)
      try {
        const outcome = await board.play(sequence, commentaryByStep, (stepIndex) => {
          const commentary = commentaryByStep[stepIndex]
          if (commentary) appendAssistantMessage(commentary)
        })
        historyRef.current = [
          ...historyRef.current,
          { question: trimmed, concept: plan.concept, lastCommentary: playbackCommentary(plan, outcome) },
        ].slice(-MAX_HISTORY_TURNS)
        if (outcome.state === "error") {
          appendAssistantMessage("I couldn't finish the drawing. Some objects may already be on the board; please ask me to correct or continue it.", "error")
        } else if (outcome.state === "cancelled") {
          appendAssistantMessage("Drawing stopped. The completed objects are still editable.")
        }
      } catch {
        appendAssistantMessage("The drawing was interrupted unexpectedly. Please check the board before continuing.", "error")
      } finally {
        setIsDrawing(false)
      }
    },
    [appendAssistantMessage, board, isDrawing, isWaitingForPlan]
  )

  const cancel = useCallback(() => {
    board.cancel()
  }, [board])

  return {
    hasQuestionSource,
    clearQuestionSource: () => { sourceRef.current = null; setHasQuestionSource(false) },
    messages,
    isThinking: isWaitingForPlan,
    isDrawing,
    sendMessage,
    cancel,
  }
}
