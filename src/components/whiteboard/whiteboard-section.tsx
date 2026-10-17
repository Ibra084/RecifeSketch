"use client"

import { useEffect, useRef, useState } from "react"
import { Tldraw, useValue, type Editor } from "tldraw"
import "tldraw/tldraw.css"
import { attachBoardPersistence, type SavedBoard, type SaveStatus } from "./board-persistence"
import { MathShapeUtil } from "@/lib/drawing/math-shape"
import { GraphShapeUtil } from "@/lib/drawing/graph-shape"

// Module-level so tldraw sees a stable array across renders.
const shapeUtils = [MathShapeUtil, GraphShapeUtil]
/** A quiet first-run hint, shown only while the board has nothing on it yet. */
function WhiteboardEmptyHint({ editor }: { editor: Editor | null }) {
  const isEmpty = useValue(
    "is board empty",
    () => (editor ? editor.getCurrentPageShapeIds().size === 0 : false),
    [editor]
  )

  if (!isEmpty) return null

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
      <p className="max-w-[260px] text-center text-[13px] leading-relaxed text-ink-muted">
        Draw freely, or tap the blue Recife orb to ask a question about your board.
      </p>
    </div>
  )
}

interface WhiteboardSectionProps {
  /** Connects the AI drawing adapter to the same editor used by the native tldraw UI. */
  onEditorMount?: (editor: Editor) => void
  /** A saved board to load and autosave to the server; without it the board persists locally. */
  board?: SavedBoard
  onSaveStatus?: (status: SaveStatus) => void
}

export function WhiteboardSection({ onEditorMount, board, onSaveStatus }: WhiteboardSectionProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  // Read through refs so the mount callback stays stable for tldraw.
  const boardRef = useRef(board)
  const statusRef = useRef(onSaveStatus)
  useEffect(() => {
    statusRef.current = onSaveStatus
  }, [onSaveStatus])

  function handleMount(mounted: Editor) {
    const saved = boardRef.current
    // Load the saved board before the AI adapter attaches, so the tutor sees its objects.
    const detach = saved
      ? attachBoardPersistence(mounted, saved, (status) => statusRef.current?.(status))
      : undefined
    setEditor(mounted)
    onEditorMount?.(mounted)
    return detach
  }

  return (
    // Contain tldraw's internal UI layers so Recife's sibling overlays stay above its tools.
    <div className="relative isolate z-0 h-full w-full bg-surface-subtle">
      <Tldraw
        persistenceKey={board ? undefined : "recife-sketch-board"}
        shapeUtils={shapeUtils}
        onMount={handleMount}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
      <WhiteboardEmptyHint editor={editor} />
    </div>
  )
}

