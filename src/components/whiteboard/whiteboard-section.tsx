"use client"

import { useEffect, useRef, useState } from "react"
import { Tldraw, useValue, type Editor, type TLComponents } from "tldraw"
import "tldraw/tldraw.css"
import { attachBoardPersistence, type SavedBoard, type SaveStatus } from "./board-persistence"
import { chooseStartingBoard, readBoardCache } from "./board-cache"
import { boardAssetStore } from "./board-images"
import { applyPenDefaults, fitPastedImages, keepImagesFromEraser } from "./board-defaults"
import { BugReporter } from "@/components/bug-report/bug-reporter"
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
  /** Hide tldraw's style panel (colours, sizes) in the top-right corner. */
  hideStylePanel?: boolean
}

// Module-level so tldraw sees stable objects across renders.
const HIDDEN_STYLE_PANEL: TLComponents = { StylePanel: null }
const DEFAULT_COMPONENTS: TLComponents = {}

export function WhiteboardSection(props: WhiteboardSectionProps) {
  const { board } = props
  // A saved board opens from whichever copy is newest - the server's, or this browser's
  // cached copy of work that never finished uploading. Decided before the editor mounts.
  const [opened, setOpened] = useState<{ id: string; board: SavedBoard } | null>(null)
  const boardId = board?.id
  useEffect(() => {
    if (!board) return
    let cancelled = false
    void readBoardCache(board.id).then((cached) => {
      if (cancelled) return
      const start = chooseStartingBoard(board, cached)
      setOpened({ id: board.id, board: { ...board, snapshot: start.snapshot, needsSync: start.needsSync } })
    })
    return () => { cancelled = true }
    // Only when a different board is opened; later server props must not reload the open board.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId])

  if (!board) return <WhiteboardCanvas {...props} />
  if (opened?.id !== board.id) {
    return <div className="flex h-full w-full items-center justify-center bg-surface-subtle text-[13px] text-ink-muted">Opening whiteboard…</div>
  }
  return <WhiteboardCanvas key={opened.id} {...props} board={opened.board} />
}

function WhiteboardCanvas({ onEditorMount, board, onSaveStatus, hideStylePanel }: WhiteboardSectionProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  // A saved board keeps pasted images in the student's storage folder, not inside its saved data.
  const [assets] = useState(() => (board ? boardAssetStore(board.id) : undefined))
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
    applyPenDefaults(mounted)
    const releaseEraser = keepImagesFromEraser(mounted)
    const releaseImageFit = fitPastedImages(mounted)
    setEditor(mounted)
    onEditorMount?.(mounted)
    return () => {
      releaseEraser()
      releaseImageFit()
      detach?.()
    }
  }

  return (
    // Contain tldraw's internal UI layers so Recife's sibling overlays stay above its tools.
    <div className="relative isolate z-0 h-full w-full bg-surface-subtle">
      <Tldraw
        persistenceKey={board ? undefined : "recife-sketch-board"}
        assets={assets}
        shapeUtils={shapeUtils}
        components={hideStylePanel ? HIDDEN_STYLE_PANEL : DEFAULT_COMPONENTS}
        onMount={handleMount}
        licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
      />
      <WhiteboardEmptyHint editor={editor} />
      <BugReporter editor={editor} boardId={board?.id} />
    </div>
  )
}

