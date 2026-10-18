"use client"

import { useCallback, useRef, useState } from "react"
import type { TLShapeId } from "tldraw"
import { z } from "zod"
import { MAX_HISTORY_TURNS, priorTurnSchema, type PriorTurn, type TutorContext } from "@/lib/ai/context"
import { playbackExplanation } from "@/lib/ai/playback-history"
import type { QuestionSource } from "@/lib/ai/question-source"
import { toDrawingSequence, type TeachingPlan } from "@/lib/ai/teaching-protocol"
import type { UsageEstimate } from "@/lib/ai/usage-tracker"
import type { PlaybackSnapshot } from "@/lib/drawing/playback/types"
import type { TrackedObjectSummary } from "@/lib/drawing/tldraw-adapter"
import type { OcrResult } from "@/lib/drawing/text-match"
import { refineCopiedFigure } from "./second-look"

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
  /**
   * Plays a sequence; step commentary is spoken beside the orb by the controller.
   * `imageRegion` is where the image the AI was shown sits on the board, so its marks land exactly.
   */
  play(sequence: ReturnType<typeof toDrawingSequence>, stepCommentary: string[], imageRegion?: QuestionSource["region"], imageText?: OcrResult | null): Promise<PlaybackSnapshot>
  /** The printed words in a board area with their exact pixel boxes (OCR), or null if they couldn't be read. */
  readImageText(image: NonNullable<QuestionSource["image"]>): Promise<OcrResult | null>
  cancel(): void
  getVisualObjects(): TrackedObjectSummary[]
  getLayout(): TutorContext["layout"]
  placeQuestion(source: QuestionSource): TLShapeId
  questionBounds(id: TLShapeId): QuestionSource["region"]
  findUnattachedQuestionImage(): TLShapeId | undefined
  exportQuestionImage(id: TLShapeId): Promise<QuestionSource["image"]>
  /**
   * Snapshot of the student's own work (plus `alsoInclude`), or undefined if there is none.
   * "full": it's what the question is about; "context": a cheaper picture shown beside the question.
   */
  captureStudentWork(alsoInclude: TLShapeId[], detail: "full" | "context"): Promise<QuestionSource | undefined>
  /** What the student has selected on the board, if anything - the thing their question is about. */
  getSelection(): TutorContext["selection"]
  /** A picture of exactly the selected area, for the tutor to look at. */
  captureSelection(): Promise<QuestionSource | undefined>
}

/** The question chain survives a reload: what was asked and explained, and which board image is the question. */
const CHAIN_STORAGE_KEY = "recife-sketch-tutor-chain-v1"
const storedChainSchema = z.object({
  history: z.array(priorTurnSchema).max(MAX_HISTORY_TURNS),
  sourceId: z.string().max(200).nullable(),
})

function loadChain(): z.infer<typeof storedChainSchema> {
  try {
    const parsed = storedChainSchema.safeParse(JSON.parse(window.localStorage.getItem(CHAIN_STORAGE_KEY) ?? "null"))
    if (parsed.success) return parsed.data
  } catch {
    // Unreadable or blocked storage: start a fresh chain.
  }
  return { history: [], sourceId: null }
}

function saveChain(history: PriorTurn[], sourceId: TLShapeId | null) {
  try {
    window.localStorage.setItem(CHAIN_STORAGE_KEY, JSON.stringify({ history, sourceId }))
  } catch {
    // Not persisted; the chain still works for this session.
  }
}

export function useTutor(board: WhiteboardController) {
  const [phase, setPhase] = useState<TutorPhase>("idle")
  const phaseRef = useRef<TutorPhase>("idle")
  const [note, setNote] = useState<TutorNote | null>(null)
  const noteIdRef = useRef(0)
  /** Questions the tutor suggests asking next, from its latest answer. */
  const [suggestions, setSuggestions] = useState<string[]>([])
  // The question chain so far - every step the student was shown, per recent question - sent with each follow-up.
  const [initialChain] = useState(() => (typeof window === "undefined" ? { history: [], sourceId: null } : loadChain()))
  const historyRef = useRef<PriorTurn[]>(initialChain.history)
  const sourceRef = useRef<{ source: QuestionSource; id: TLShapeId } | null>(null)
  /** The question image's board id, remembered across reloads; its image is re-read from the board when needed. */
  const sourceIdRef = useRef<TLShapeId | null>(initialChain.sourceId as TLShapeId | null)
  const [hasQuestionSource, setHasQuestionSource] = useState(initialChain.sourceId !== null || initialChain.history.length > 0)
  const requestRef = useRef<AbortController | null>(null)
  const lastQuestionRef = useRef("")
  /** The question currently being answered, so a follow-up can wait for it to wind down. */
  const activeAskRef = useRef<Promise<void> | null>(null)
  /** Set while a follow-up is stopping the current lesson, so that stop isn't announced as the student's. */
  const followUpPendingRef = useRef(false)

  const setPhaseBoth = useCallback((next: TutorPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])

  const say = useCallback((text: string, variant?: "error") => {
    setNote({ id: ++noteIdRef.current, text, variant })
  }, [])
  const dismissNote = useCallback(() => setNote(null), [])

  const run = useCallback(
    async (question: string, attached?: QuestionSource) => {
      lastQuestionRef.current = question
      setNote(null)
      setSuggestions([])

      if (!board.isReady()) {
        say("The whiteboard isn't ready yet - try again in a moment.", "error")
        return
      }

      if (attached) {
        try {
          sourceRef.current = { source: { ...attached, kind: "question" }, id: board.placeQuestion(attached) }
          sourceIdRef.current = sourceRef.current.id
          setHasQuestionSource(true)
        } catch {
          say("Couldn't place the question on the board. Please try again.", "error")
          return
        }
      } else {
        // A photo pasted onto the board since the last question is the new question (never lumped in with
        // the student's work); otherwise the chain's question image, re-read from the board after a reload.
        const pasted = board.findUnattachedQuestionImage()
        const knownId = !sourceRef.current && sourceIdRef.current && board.questionBounds(sourceIdRef.current) ? sourceIdRef.current : undefined
        const imageId = pasted ?? knownId
        if (imageId) {
          try {
            const image = await board.exportQuestionImage(imageId)
            sourceRef.current = { source: { image, kind: "question" }, id: imageId }
            sourceIdRef.current = imageId
            setHasQuestionSource(true)
          } catch {
            // Fall through: the previous question (or the student-work snapshot) still applies.
          }
        }
      }
      saveChain(historyRef.current, sourceIdRef.current)

      setPhaseBoth("thinking")
      const stored = sourceRef.current
      // Anything selected on the board is what the question is about: it comes first, with a picture of exactly it.
      const selection = board.getSelection()
      let source: QuestionSource | undefined
      try {
        if (selection) {
          source = await board.captureSelection()
        } else if (stored) {
          // The question image itself, in full detail, is what every mark refers to. The student's own
          // working beside it (if any) goes along as a second, cheaper picture for context.
          const region = board.questionBounds(stored.id)
          if (region) {
            const work = await board.captureStudentWork([], "context").catch(() => undefined)
            source = {
              ...stored.source,
              region,
              ...(work?.image && work.region ? { work: { image: work.image, region: work.region } } : {}),
              ...(work?.shapes ? { shapes: work.shapes } : {}),
            }
          }
        } else {
          // No question image: the student's own handwriting/sketches are what "where did I go wrong?" is about.
          source = await board.captureStudentWork([], "full")
        }
      } catch {
        source = undefined
      }

      // Read the image's printed words (OCR) while the tutor thinks: exact keyword highlights and figure crops use them.
      const imageTextPromise = source?.image && source.region ? board.readImageText(source.image).catch(() => null) : Promise.resolve(null)

      const context: TutorContext = {
        objects: board.getVisualObjects(),
        history: historyRef.current,
        layout: board.getLayout(),
        ...(selection ? { selection } : {}),
      }

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
        setPhaseBoth("idle")
        if (controller.signal.reason === "timeout") say("The AI tutor took too long to respond. Please try again.", "error")
        else if (controller.signal.aborted) say("Stopped. Ask again whenever you're ready.")
        else say("I couldn't reach the AI tutor. Check your connection and try again.", "error")
        return
      } finally {
        window.clearTimeout(timeout)
        requestRef.current = null
      }

      if (!json.ok) {
        setPhaseBoth("idle")
        say(json.error.message, "error")
        return
      }

      // A copied figure gets one zoomed-in second look, so forces and labels land exactly on its parts.
      // Stop still works while it runs; if it fails, the lesson goes ahead with the first guesses.
      const lookController = new AbortController()
      requestRef.current = lookController
      const plan = await refineCopiedFigure(json.plan, source?.image, lookController.signal)
      requestRef.current = null
      if (lookController.signal.aborted) {
        setPhaseBoth("idle")
        say("Stopped. Ask again whenever you're ready.")
        return
      }
      const commentary = plan.steps.map((step) => step.commentary)
      setSuggestions(plan.followUps ?? [])
      setPhaseBoth("drawing")
      try {
        // OCR normally finishes well before the answer arrives; never hold the lesson up for long waiting on it.
        const imageText = await Promise.race([imageTextPromise, new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000))])
        const outcome = await board.play(toDrawingSequence(plan), commentary, source?.image ? source.region : undefined, imageText)
        historyRef.current = [
          ...historyRef.current,
          { question: question.slice(0, 500), concept: plan.concept.slice(0, 200), explanation: playbackExplanation(plan, outcome) },
        ].slice(-MAX_HISTORY_TURNS)
        saveChain(historyRef.current, sourceIdRef.current)
        setHasQuestionSource(true)
        if (outcome.state === "error") {
          say("I couldn't finish that drawing. Ask me to correct or continue it.", "error")
        } else if (outcome.state === "cancelled" && !followUpPendingRef.current) {
          say("Stopped. Everything already drawn is still editable.")
        }
      } catch {
        say("The drawing was interrupted unexpectedly. Check the board before continuing.", "error")
      } finally {
        setPhaseBoth("idle")
      }
    },
    [board, say, setPhaseBoth]
  )

  /**
   * Asks a question in the current chain. While a lesson is still playing
   * (e.g. waiting for Next) a follow-up stops its remaining steps - what's
   * drawn stays, and the tutor remembers exactly which steps were shown -
   * then answers in context.
   */
  const ask = useCallback(
    async (rawQuestion: string, attached?: QuestionSource) => {
      const question = rawQuestion.trim()
      if (!question) return
      if (phaseRef.current === "thinking") return
      if (phaseRef.current === "drawing") {
        followUpPendingRef.current = true
        board.cancel()
        await activeAskRef.current
        followUpPendingRef.current = false
      }
      const current = run(question, attached)
      activeAskRef.current = current
      try {
        await current
      } finally {
        if (activeAskRef.current === current) activeAskRef.current = null
      }
    },
    [board, run]
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
    /** Follow-up questions suggested by the latest answer (empty while thinking or after "New topic"). */
    suggestions,
    /** A question chain is under way (a question image, or earlier answers to build on). */
    hasQuestionSource,
    /** "New topic": forget the question image and the conversation so far; the board itself is untouched. */
    clearQuestionSource: () => {
      sourceRef.current = null
      sourceIdRef.current = null
      historyRef.current = []
      saveChain([], null)
      setHasQuestionSource(false)
      setSuggestions([])
    },
  }
}
