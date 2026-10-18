"use client"

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, CircleCheck, CornerDownRight, MessageCircle, MousePointerClick, Paperclip, PenLine, Send, Sparkles, Square, X } from "lucide-react"
import type { QuestionSource } from "@/lib/ai/question-source"
import { viewportPoint, viewportRect, type ViewportPoint, type ViewportRect, type ViewportSize } from "@/lib/overlay/coordinates"
import { clampToViewport, placeSpeech } from "@/lib/overlay/placement"
import { renderMixed } from "@/lib/drawing/math-render"
import { cn } from "@/lib/utils"
import { readQuestionImage } from "./question-image"
import type { PendingMistake, TutorNote } from "./use-tutor"
import { ORB_SIZE } from "./use-companion-orb"

export type CompanionState = "idle" | "thinking" | "drawing" | "speaking"

const STATE_LABEL: Record<CompanionState, string> = {
  idle: "Recife tutor - click to ask a question",
  thinking: "Recife is thinking",
  drawing: "Recife is drawing on the board",
  speaking: "Recife is explaining",
}

const PANEL_WIDTH = 340
const KEY_STEP = 24

interface AiCompanionProps {
  position: ViewportPoint
  viewport: ViewportSize
  state: CompanionState
  busy: boolean
  /** A lesson is paused on a step: a follow-up question may be asked now (it stops the remaining steps). */
  acceptsFollowUp: boolean
  note: TutorNote | null
  onDismissNote: () => void
  onUserMove: (p: ViewportPoint) => void
  onAsk: (question: string, source?: QuestionSource) => void
  onRetry: () => void
  onCancel: () => void
  /** What the tutor is saying about the current step, shown briefly beside the orb. */
  speech: TutorSpeech | null
  onSpeechBack: () => void
  onSpeechNext: () => void
  /** Every explanation of the latest lesson so far, listed when the orb is opened. */
  lessonSteps: string[]
  /** How many things are selected on the board - the question will be about them. */
  selectionCount: number
  onClearSelection: () => void
  hasQuestionSource: boolean
  onClearQuestionSource: () => void
  /** Follow-up questions the tutor suggests; tapping one asks it. */
  suggestions: string[]
  /** Mistake Memory: check the selected working. */
  onCheckWork: () => void
  /** A verified mistake the student may save for revision. */
  pendingMistake: PendingMistake | null
  onSaveMistake: () => void
  onDismissMistake: () => void
}

/** "Save this mistake for revision?" - shown after a verified mistake, the student decides. */
function SaveMistakeCard({ pending, onSave, onDismiss }: { pending: PendingMistake; onSave: () => void; onDismiss: () => void }) {
  if (pending.state === "saved") {
    return (
      <p role="status" className="mb-2.5 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-[12.5px] text-green-700">
        <BookmarkCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        Saved to Mistake Memory - practise it from your dashboard.
      </p>
    )
  }
  return (
    <div className="mb-2.5 rounded-xl border border-border-subtle bg-surface-subtle px-3 py-2.5">
      <p className="text-[13px] font-semibold text-ink">Save this mistake for revision?</p>
      <p className="mt-0.5 text-[12px] leading-snug text-ink-secondary">{pending.draft.concept}: {pending.draft.misconception}</p>
      {pending.state === "error" && <p role="alert" className="mt-1 text-[12px] text-red-600">{pending.error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending.state === "saving"}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50 pointer-coarse:h-11"
        >
          <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
          {pending.state === "saving" ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDismiss} className="h-8 rounded-lg px-2.5 text-[12px] font-medium text-ink-secondary hover:bg-surface-sunken hover:text-ink pointer-coarse:h-11">
          No thanks
        </button>
      </div>
    </div>
  )
}

function OrbIcon({ state }: { state: CompanionState }) {
  if (state === "thinking") {
    return (
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-bounce" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
    )
  }
  const Icon = state === "drawing" ? PenLine : state === "speaking" ? MessageCircle : Sparkles
  return <Icon className="h-6 w-6 text-white" aria-hidden="true" />
}

export function AiCompanion(props: AiCompanionProps) {
  const { position, viewport, state, busy, note, onDismissNote, onUserMove, onAsk, onCancel } = props
  const canAsk = !busy || props.acceptsFollowUp
  const [expanded, setExpanded] = useState(false)
  const [draft, setDraft] = useState("")
  const [attachment, setAttachment] = useState<{ image: NonNullable<QuestionSource["image"]>; name: string } | null>(null)
  const [attachError, setAttachError] = useState("")
  const [dragPos, setDragPos] = useState<ViewportPoint | null>(null)
  const dragRef = useRef<{ x: number; y: number; start: ViewportPoint; moved: boolean } | null>(null)
  const orbRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const panelId = useId()
  // The orb shows a dot until the student opens it after new suggestions arrive.
  const suggestionsKey = props.suggestions.join("\n") + (props.pendingMistake?.state === "offered" ? "\nsave-mistake" : "")
  const [seenSuggestions, setSeenSuggestions] = useState("")
  const unseenSuggestions = suggestionsKey !== "" && suggestionsKey !== seenSuggestions

  function toggleExpanded() {
    if (!expanded) setSeenSuggestions(suggestionsKey)
    setExpanded(!expanded)
  }

  const shown = dragPos ?? position
  const clamp = (p: ViewportPoint) => clampToViewport(viewportRect(p.x, p.y, ORB_SIZE, ORB_SIZE), viewport)

  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  useEffect(() => {
    if (!note || note.variant === "error") return
    const timer = window.setTimeout(onDismissNote, 6000)
    return () => window.clearTimeout(timer)
  }, [note, onDismissNote])

  function collapse(returnFocus: boolean) {
    setExpanded(false)
    if (returnFocus) orbRef.current?.focus()
  }

  function submit() {
    const question = draft.trim() || (attachment ? "Help me understand this question, starting with a hint." : "")
    if (!question || !canAsk) return
    onAsk(question, attachment ? { image: attachment.image } : undefined)
    setDraft("")
    setAttachment(null)
    collapse(false)
  }

  function onOrbPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { x: event.clientX, y: event.clientY, start: position, moved: false }
  }
  function onOrbPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 4) return
    drag.moved = true
    setDragPos(clamp(viewportPoint(drag.start.x + dx, drag.start.y + dy)))
  }
  function onOrbPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.moved) {
      onUserMove(clamp(viewportPoint(drag.start.x + event.clientX - drag.x, drag.start.y + event.clientY - drag.y)))
      setDragPos(null)
    } else {
      toggleExpanded()
    }
  }
  function onOrbKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? KEY_STEP * 3 : KEY_STEP
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key]
    if (delta) {
      event.preventDefault()
      onUserMove(clamp(viewportPoint(position.x + delta[0], position.y + delta[1])))
    } else if (event.key === "Escape" && expanded) {
      collapse(true)
    }
  }

  const narrow = viewport.w < 640
  const panelWidth = Math.min(PANEL_WIDTH, viewport.w - 24)
  const panelLeft = Math.min(Math.max(12, shown.x + ORB_SIZE - panelWidth), viewport.w - panelWidth - 12)
  const openAbove = shown.y > 260
  const panelStyle = narrow
    ? { left: 12, right: 12, bottom: 12 }
    : openAbove
      ? { left: panelLeft, width: panelWidth, bottom: viewport.h - shown.y + 10 }
      : { left: panelLeft, width: panelWidth, top: shown.y + ORB_SIZE + 10 }
  const noteRight = shown.x > viewport.w / 2

  return (
    <div className="pointer-events-none absolute inset-0 z-40" data-testid="ai-companion">
      <span className="sr-only" aria-live="polite">
        {state === "idle" ? "" : STATE_LABEL[state]}
      </span>

      <button
        ref={orbRef}
        type="button"
        data-state={state}
        aria-label={STATE_LABEL[state]}
        aria-expanded={expanded}
        aria-controls={panelId}
        onPointerDown={onOrbPointerDown}
        onPointerMove={onOrbPointerMove}
        onPointerUp={onOrbPointerUp}
        onPointerCancel={() => { dragRef.current = null; setDragPos(null) }}
        onKeyDown={onOrbKeyDown}
        onClick={(event) => {
          // Keyboard activation (Enter/Space) has detail 0; pointer clicks are handled on pointerup.
          if (event.detail === 0) toggleExpanded()
        }}
        className={cn(
          "group pointer-events-auto absolute flex touch-none select-none items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 outline-none focus-visible:ring-4 focus-visible:ring-ring/50",
          dragPos ? "cursor-grabbing" : "cursor-grab transition-[left,top] duration-700"
        )}
        style={{
          left: shown.x,
          top: shown.y,
          width: ORB_SIZE,
          height: ORB_SIZE,
          transitionTimingFunction: "var(--ease-premium)",
          boxShadow: "0 6px 20px rgba(37, 99, 235, 0.35), var(--shadow-soft)",
        }}
      >
        <span
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full",
            state === "drawing" && "motion-safe:animate-ping bg-blue-400/30",
            state === "speaking" && "ring-4 ring-blue-300/60",
            state === "idle" && "motion-safe:animate-[orb-breathe_3.2s_ease-in-out_infinite]"
          )}
        />
        <OrbIcon state={state} />
        {unseenSuggestions && !expanded && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-400"
          />
        )}
      </button>

      {props.speech && !note && !expanded && (
        <SpeechBubble
          key={props.speech.id}
          speech={props.speech}
          orb={viewportRect(shown.x, shown.y, ORB_SIZE, ORB_SIZE)}
          viewport={viewport}
          gliding={!dragPos}
          onBack={props.onSpeechBack}
          onNext={props.onSpeechNext}
        />
      )}

      {busy && (
        <button
          type="button"
          onClick={onCancel}
          aria-label={state === "thinking" ? "Stop waiting for Recife" : "Stop drawing"}
          className="pointer-events-auto absolute flex h-8 items-center gap-1 rounded-full border border-border-subtle bg-surface px-3 text-[12px] font-medium text-ink-secondary hover:text-ink pointer-coarse:h-11"
          style={{ left: shown.x + ORB_SIZE / 2, top: shown.y + ORB_SIZE + 6, transform: "translateX(-50%)", boxShadow: "var(--shadow-soft)" }}
        >
          <Square className="h-3 w-3" /> Stop
        </button>
      )}

      {note && !expanded && (
        <div
          role={note.variant === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto absolute flex max-w-[260px] items-start gap-2 rounded-xl border px-3 py-2 text-[13px] leading-relaxed",
            note.variant === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-border-subtle bg-surface text-ink"
          )}
          style={{
            top: Math.max(8, shown.y - 4),
            ...(noteRight ? { right: viewport.w - shown.x + 10 } : { left: shown.x + ORB_SIZE + 10 }),
            boxShadow: "var(--shadow-popover)",
          }}
        >
          <span>{note.text}{note.variant === "error" && !busy && (
            <button type="button" onClick={props.onRetry} className="mt-2 block font-semibold underline">Retry question</button>
          )}</span>
          <button type="button" onClick={onDismissNote} aria-label="Dismiss message" className="-mr-1 mt-0.5 shrink-0 text-current opacity-70 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {expanded && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Ask Recife"
          className="pointer-events-auto absolute rounded-2xl border border-border-subtle bg-surface p-2.5"
          style={{ ...panelStyle, boxShadow: "var(--shadow-popover)" }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Escape") {
              event.stopPropagation()
              collapse(true)
            }
          }}
        >
          {props.lessonSteps.length > 0 && (
            <ol
              aria-label="Steps of the last explanation"
              data-scrollable
              className="mb-2.5 max-h-56 space-y-2 overflow-y-auto border-b border-border-subtle px-1 pb-2.5"
            >
              {props.lessonSteps.map((step, index) => (
                <li key={index} className="flex gap-2 text-[13px] leading-relaxed text-ink">
                  <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[11px] font-semibold text-accent-foreground">
                    {index + 1}
                  </span>
                  {/* renderMixed escapes the prose and typesets $...$ maths (KaTeX, no raw HTML or links). */}
                  <span dangerouslySetInnerHTML={{ __html: renderMixed(step) }} />
                </li>
              ))}
            </ol>
          )}
          {props.pendingMistake && (
            <SaveMistakeCard pending={props.pendingMistake} onSave={props.onSaveMistake} onDismiss={props.onDismissMistake} />
          )}
          {props.suggestions.length > 0 && canAsk && (
            <div className="mb-2.5 border-b border-border-subtle px-1 pb-2.5">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Try asking</p>
              <ul className="flex flex-col gap-1.5">
                {props.suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      onClick={() => {
                        onAsk(suggestion)
                        collapse(false)
                      }}
                      className="flex w-full items-start gap-2 rounded-xl border border-border-subtle bg-surface px-2.5 py-2 text-left text-[13px] leading-snug text-ink transition-colors duration-150 hover:border-accent hover:bg-accent-subtle pointer-coarse:min-h-11"
                    >
                      <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-foreground" aria-hidden="true" />
                      <span dangerouslySetInnerHTML={{ __html: renderMixed(suggestion) }} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {props.selectionCount > 0 && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-accent-subtle px-2.5 py-1.5 text-[12px] text-accent-foreground">
              <span className="flex items-center gap-1.5">
                <MousePointerClick className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Asking about your selection ({props.selectionCount} {props.selectionCount === 1 ? "item" : "items"})
              </span>
              <button type="button" onClick={props.onClearSelection} aria-label="Don't ask about the selection" className="shrink-0 opacity-70 hover:opacity-100">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === "Escape") {
                collapse(true)
              } else if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                submit()
              }
            }}
            rows={2}
            disabled={!canAsk}
            placeholder={
              props.selectionCount > 0 ? "Ask about what you selected, e.g. “Explain this step”"
                : props.acceptsFollowUp ? "Ask a follow-up about this step…"
                : busy ? "Recife is working - wait or stop it first"
                : props.hasQuestionSource ? "Ask a follow-up, e.g. “Why did you use cos there?”"
                : "Ask about the board, e.g. “Where did I go wrong?”"
            }
            aria-label="Question for Recife"
            className="block w-full resize-none rounded-xl border border-border-subtle bg-surface-subtle px-3 py-2 text-base text-ink outline-none placeholder:text-ink-muted focus-visible:border-accent md:text-[13px]"
          />
          {attachment && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-accent-subtle px-2.5 py-1.5 text-[12px] text-accent-foreground">
              <span className="truncate">{attachment.name} attached</span>
              <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attached image" className="shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {attachError && <p role="alert" className="mt-1.5 text-[12px] text-red-600">{attachError}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ""
                  if (!file) return
                  setAttachError("")
                  try {
                    setAttachment({ image: await readQuestionImage(file), name: file.name })
                  } catch (error) {
                    setAttachError(error instanceof Error ? error.message : "Couldn't read that image.")
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                aria-label="Attach a question image"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-sunken hover:text-ink disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onCheckWork()
                  collapse(false)
                }}
                disabled={busy}
                title="Check the working you've selected"
                className="flex h-9 items-center gap-1 truncate rounded-lg px-2 text-[12px] font-medium text-ink-secondary hover:bg-surface-sunken hover:text-ink disabled:opacity-40 pointer-coarse:h-11"
              >
                <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                Check my work
              </button>
              {props.hasQuestionSource && (
                <button
                  type="button"
                  onClick={props.onClearQuestionSource}
                  disabled={busy}
                  className="truncate rounded-lg px-2 py-1.5 text-[12px] text-ink-secondary hover:bg-surface-sunken hover:text-ink"
                >
                  New topic
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={!canAsk || (!draft.trim() && !attachment)}
              aria-label="Send question"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export interface TutorSpeech {
  id: number
  text: string
  step: number
  totalSteps: number
  /** On-screen area being explained; the bubble opens on the other side of the orb. */
  avoid: ViewportRect | null
  /** Set just before it closes, so it fades out instead of vanishing. */
  leaving?: boolean
  canGoBack: boolean
  /** What the forward button does: move on, finish the lesson, or wait while this step is still drawing. */
  next: "next" | "done" | "drawing"
}

const SPEECH_MAX_WIDTH = 300

/** Where tldraw's own controls sit (page menu, style panel, toolbar, zoom) - the speech bubble stays off them. */
function tldrawChrome(viewport: ViewportSize): ViewportRect[] {
  return [
    viewportRect(0, 0, 320, 48),
    viewportRect(viewport.w - 168, 0, 168, 300),
    viewportRect(viewport.w / 2 - 230, viewport.h - 66, 460, 66),
    viewportRect(0, viewport.h - 56, 140, 56),
  ]
}

/** Rough rendered height (text plus the Back/Next row), for choosing a side before the bubble is on screen. */
function estimateSpeechHeight(text: string, width: number): number {
  const charsPerLine = Math.max(16, Math.floor((width - 28) / 7))
  const fractions = (text.match(/\\frac/g) ?? []).length
  return 86 + Math.ceil(text.length / charsPerLine) * 21 + fractions * 12
}

function SpeechBubble({
  speech,
  orb,
  viewport,
  gliding,
  onBack,
  onNext,
}: {
  speech: TutorSpeech
  orb: ViewportRect
  viewport: ViewportSize
  gliding: boolean
  onBack: () => void
  onNext: () => void
}) {
  const width = Math.min(SPEECH_MAX_WIDTH, viewport.w - 24)
  const size = { w: width, h: estimateSpeechHeight(speech.text, width) }
  const at = placeSpeech(orb, size, [...(speech.avoid ? [speech.avoid] : []), ...tldrawChrome(viewport)], viewport)
  const nextLabel = speech.next === "done" ? "Done" : speech.next === "drawing" ? "Drawing…" : "Next"
  return (
    <div
      role="region"
      aria-label="Recife's explanation"
      // Keys pressed here (e.g. Enter on Next) must not reach tldraw's shortcuts.
      onKeyDown={(event) => event.stopPropagation()}
      className={cn(
        "pointer-events-auto absolute rounded-2xl border border-border-subtle bg-surface px-3.5 pb-2.5 pt-2.5 motion-safe:animate-[speech-in_220ms_var(--ease-premium)]",
        gliding && "transition-[left,top,opacity] duration-700",
        speech.leaving && "opacity-0 duration-300"
      )}
      style={{ left: at.x, top: at.y, width, boxShadow: "var(--shadow-popover)", transitionTimingFunction: "var(--ease-premium)" }}
    >
      {speech.totalSteps > 1 && (
        <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-foreground">
          Step {speech.step} of {speech.totalSteps}
        </p>
      )}
      {/* renderMixed escapes the prose and typesets $...$ maths (KaTeX, no raw HTML or links). */}
      <p aria-live="polite" className="text-[14px] leading-relaxed text-ink" dangerouslySetInnerHTML={{ __html: renderMixed(speech.text) }} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={!speech.canGoBack}
          aria-label="Previous step"
          className="flex h-8 items-center gap-0.5 rounded-lg px-2 text-[12px] font-medium text-ink-secondary hover:bg-surface-sunken hover:text-ink disabled:invisible pointer-coarse:h-11"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={speech.next === "drawing"}
          className="flex h-8 items-center gap-0.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50 pointer-coarse:h-11"
        >
          {nextLabel}{speech.next === "next" && <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}
