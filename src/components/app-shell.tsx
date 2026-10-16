"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Editor } from "tldraw"
import { MessageSquare, PanelRightClose, PanelRightOpen } from "lucide-react"
import { RecifeWordmark } from "@/components/brand/recife-wordmark"
import { ChatPanelContent } from "@/components/chat/chat-panel-content"
import { useTutorChat, type WhiteboardController } from "@/components/chat/use-tutor-chat"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { DrawingEngine } from "@/lib/drawing/engine"
import { TldrawDrawingAdapter } from "@/lib/drawing/tldraw-adapter"
import { DrawingPlayer } from "@/lib/drawing/playback/player"
import { TldrawShapeAnimator } from "@/lib/drawing/playback/tldraw-animator"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { placeQuestionSheet, findUnattachedQuestionImage, markQuestionSourceAttached } from "@/lib/drawing/question-sheet"
import { readQuestionImageBlob } from "@/components/chat/question-image"
import { actionFocusPoint } from "@/lib/drawing/action-focus-point"
import type { DrawingSequence } from "@/lib/drawing/playback/types"

interface CursorState {
  x: number
  y: number
  label: string
}

/**
 * A visible pointer that moves to wherever the AI is currently drawing,
 * with that step's commentary shown right there on the board - so a
 * student can see where to look instead of only reading disconnected
 * chat text. The full commentary still goes to chat too, as the
 * reviewable log; this is a spatial complement to it, not a replacement.
 */
function AiCursorOverlay({ cursor }: { cursor: CursorState | null }) {
  if (!cursor) return null
  return (
    <div
      className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-500 ease-[var(--ease-premium)]"
      style={{ left: cursor.x, top: cursor.y }}
    >
      <div className="flex flex-col items-center">
        <span className="h-3 w-3 shrink-0 rounded-full bg-accent ring-4 ring-accent-subtle" />
        {cursor.label && (
          <div
            className="mt-2 max-w-[240px] rounded-xl border border-border-subtle bg-surface px-3 py-2 text-[12px] leading-relaxed text-ink"
            style={{ boxShadow: "var(--shadow-popover)" }}
          >
            {cursor.label}
          </div>
        )}
      </div>
    </div>
  )
}

// tldraw touches browser-only APIs (IndexedDB, window) during setup, so it
// must never render on the server.
const WhiteboardSection = dynamic(
  () => import("@/components/whiteboard/whiteboard-section").then((mod) => mod.WhiteboardSection),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-surface-subtle text-[13px] text-ink-muted">
        Loading whiteboard…
      </div>
    ),
  }
)

export function AppShell() {
  const [isChatCollapsed, setIsChatCollapsed] = useState(false)
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false)

  // The engine and animator live for the whiteboard's whole mounted
  // lifetime (not recreated per chat message), so object ids stay
  // addressable and the board keeps persisting across turns - a fresh
  // DrawingPlayer is created per `play()` call, same as the dev harness.
  const engineRef = useRef<DrawingEngine | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const adapterRef = useRef<TldrawDrawingAdapter | null>(null)
  const animatorRef = useRef<TldrawShapeAnimator | null>(null)
  const playerRef = useRef<DrawingPlayer | null>(null)

  const [cursor, setCursor] = useState<CursorState | null>(null)

  const resolveStepFocusPoint = useCallback((sequence: DrawingSequence, stepIndex: number) => {
    const step = sequence[stepIndex]
    const adapter = adapterRef.current
    if (!step) return null
    for (const action of step.actions) {
      const point = actionFocusPoint(action)
      if (point) return point
      if ("id" in action && adapter) {
        const bounds = adapter.getObjectBounds(action.id)
        if (bounds) return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }
      }
    }
    return null
  }, [])

  const handleEditorMount = useCallback((editor: Editor) => {
    editorRef.current = editor
    adapterRef.current?.dispose()
    const adapter = new TldrawDrawingAdapter(editor)
    adapterRef.current = adapter
    engineRef.current = new DrawingEngine(adapter)
    animatorRef.current = new TldrawShapeAnimator(editor)
  }, [])
  useEffect(() => () => adapterRef.current?.dispose(), [])

  const [boardController] = useState<WhiteboardController>(() => ({
    isReady: () => engineRef.current !== null && animatorRef.current !== null,
    play: async (sequence, stepCommentary, onStepStart) => {
      const engine = engineRef.current
      const animator = animatorRef.current
      if (!engine || !animator) throw new Error("Whiteboard not ready")

      // The drawing itself (every shape, in the same order) always happens
      // regardless of this setting - only the cosmetic reveal speed and
      // inter-step pause shrink to near-zero when the user has asked the
      // OS for reduced motion.
      const reduceMotion = prefersReducedMotion()
      const player = new DrawingPlayer({
        engine,
        animator,
        ...(reduceMotion ? { baseActionDurationMs: 1, baseStepPauseMs: 1 } : {}),
      })
      playerRef.current = player
      let announcedStepIndex = -1
      const unsubscribe = player.subscribe((snapshot) => {
        if (snapshot.state === "drawing" && snapshot.stepIndex !== announcedStepIndex) {
          announcedStepIndex = snapshot.stepIndex
          onStepStart(snapshot.stepIndex)

          const point = resolveStepFocusPoint(sequence, snapshot.stepIndex)
          const editor = editorRef.current
          if (point && editor) {
            const screen = editor.pageToScreen(point)
            setCursor({ x: screen.x, y: screen.y, label: stepCommentary[snapshot.stepIndex] ?? "" })
          }
        }
      })

      try {
        await player.play(sequence)
        return player.getSnapshot()
      } finally {
        unsubscribe()
        playerRef.current = null
        setCursor(null)
      }
    },
    cancel: () => playerRef.current?.cancel(),
    getVisualObjects: () => adapterRef.current?.summarizeObjects() ?? [],
    placeQuestion: (source) => {
      if (!editorRef.current) throw new Error("Whiteboard not ready")
      return placeQuestionSheet(editorRef.current, source)
    },
    questionBounds: (id) => {
      const box = editorRef.current?.getShapePageBounds(id)
      return box ? { x: box.x, y: box.y, w: box.w, h: box.h } : undefined
    },
    findUnattachedQuestionImage: () => {
      const editor = editorRef.current
      return editor ? findUnattachedQuestionImage(editor) : undefined
    },
    exportQuestionImage: async (id) => {
      const editor = editorRef.current
      if (!editor) throw new Error("Whiteboard not ready")
      const { blob } = await editor.toImage([id], { format: "jpeg", quality: 0.85, background: true })
      const image = await readQuestionImageBlob(blob)
      markQuestionSourceAttached(editor, id)
      return image
    },
  }))

  const chat = useTutorChat(boardController)

  return (
    <div className="flex h-dvh w-full flex-col bg-surface-subtle">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border-subtle bg-surface px-4">
        <RecifeWordmark />
        <button
          onClick={() => setIsChatCollapsed((collapsed) => !collapsed)}
          aria-label={isChatCollapsed ? "Expand chat panel" : "Collapse chat panel"}
          className="tap-target hidden items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-surface-sunken hover:text-ink lg:flex"
        >
          {isChatCollapsed ? (
            <PanelRightOpen className="h-4 w-4" />
          ) : (
            <PanelRightClose className="h-4 w-4" />
          )}
        </button>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          <WhiteboardSection onEditorMount={handleEditorMount} />
          <AiCursorOverlay cursor={cursor} />
        </div>

        <aside
          className={cn(
            "hidden shrink-0 overflow-hidden border-l border-border-subtle bg-surface transition-[width] duration-200 lg:flex",
            isChatCollapsed ? "w-0" : "w-[25%] min-w-[320px] max-w-[420px]"
          )}
          style={{ transitionTimingFunction: "var(--ease-premium)" }}
        >
          <div className="flex h-full w-full flex-col">
            <ChatPanelContent {...chat} />
          </div>
        </aside>

        {isChatCollapsed && (
          <button
            onClick={() => setIsChatCollapsed(false)}
            aria-label="Expand chat panel"
            className="tap-target absolute right-4 top-4 hidden items-center justify-center rounded-full border border-border-subtle bg-surface text-ink-secondary lg:flex"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
      </div>

      <Sheet open={isMobileChatOpen} onOpenChange={setIsMobileChatOpen}>
        <SheetTrigger
          render={
            <button
              aria-label="Open tutor chat"
              className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground lg:hidden"
              style={{ boxShadow: "var(--shadow-popover)" }}
            />
          }
        >
          <MessageSquare className="h-6 w-6" />
        </SheetTrigger>
        <SheetContent side="bottom" showCloseButton={false} className="h-[75vh] p-0 lg:hidden">
          <SheetTitle className="sr-only">Tutor chat</SheetTitle>
          <ChatPanelContent {...chat} onRequestClose={() => setIsMobileChatOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
