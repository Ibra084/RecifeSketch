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
import { placeQuestionSheet } from "@/lib/drawing/question-sheet"

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
    play: async (sequence, onStepStart) => {
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
        }
      })

      try {
        await player.play(sequence)
        return player.getSnapshot()
      } finally {
        unsubscribe()
        playerRef.current = null
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
