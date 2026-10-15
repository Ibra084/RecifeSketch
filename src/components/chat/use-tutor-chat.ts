"use client"

import { useCallback, useRef, useState } from "react"
import { MAX_HISTORY_TURNS, type PriorTurn, type TutorContext } from "@/lib/ai/context"
import { toDrawingSequence, type TeachingPlan } from "@/lib/ai/teaching-protocol"
import type { UsageEstimate } from "@/lib/ai/usage-tracker"
import type { TrackedObjectSummary } from "@/lib/drawing/tldraw-adapter"

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
  isReady(): boolean
  /** Plays a sequence, calling `onStepStart` once each time a new step begins drawing. */
  play(sequence: ReturnType<typeof toDrawingSequence>, onStepStart: (stepIndex: number) => void): Promise<void>
  cancel(): void
  /** A compact snapshot of AI-created objects still live on the board, for follow-up context. */
  getVisualObjects(): TrackedObjectSummary[]
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

  const appendAssistantMessage = useCallback((content: string, variant?: "error") => {
    setMessages((prev) => [...prev, { id: createId(), role: "assistant", content, variant }])
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim()
      if (!trimmed || isWaitingForPlan || isDrawing) return

      setMessages((prev) => [...prev, { id: createId(), role: "user", content: trimmed }])

      if (!board.isReady()) {
        appendAssistantMessage(NOT_READY_MESSAGE, "error")
        return
      }

      const context: TutorContext = { objects: board.getVisualObjects(), history: historyRef.current }

      setIsWaitingForPlan(true)
      let json: TutorResponse
      try {
        const response = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: trimmed, context }),
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
      const lastCommentary = commentaryByStep[commentaryByStep.length - 1]
      historyRef.current = [
        ...historyRef.current,
        { question: trimmed, concept: plan.concept, lastCommentary },
      ].slice(-MAX_HISTORY_TURNS)

      setIsDrawing(true)
      try {
        await board.play(sequence, (stepIndex) => {
          const commentary = commentaryByStep[stepIndex]
          if (commentary) appendAssistantMessage(commentary)
        })
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
    messages,
    isThinking: isWaitingForPlan,
    isDrawing,
    sendMessage,
    cancel,
  }
}
