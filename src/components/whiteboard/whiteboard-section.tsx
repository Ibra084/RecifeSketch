"use client"

import { useState } from "react"
import { Tldraw, useValue, type Editor } from "tldraw"
import "tldraw/tldraw.css"
import { MathShapeUtil } from "@/lib/drawing/math-shape"

// Module-level so tldraw sees a stable array across renders.
const shapeUtils = [MathShapeUtil]
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
}

export function WhiteboardSection({ onEditorMount }: WhiteboardSectionProps) {
  const [editor, setEditor] = useState<Editor | null>(null)

  function handleMount(mounted: Editor) {
    setEditor(mounted)
    onEditorMount?.(mounted)
  }

  return (
    // Contain tldraw's internal UI layers so Recife's sibling overlays stay above its tools.
    <div className="relative isolate z-0 h-full w-full bg-surface-subtle">
      <Tldraw
        persistenceKey="recife-sketch-board"
        shapeUtils={shapeUtils}
        onMount={handleMount}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
      <WhiteboardEmptyHint editor={editor} />
    </div>
  )
}

