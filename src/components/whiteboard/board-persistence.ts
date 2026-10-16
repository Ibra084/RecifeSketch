import { getSnapshot, loadSnapshot, type Editor, type TLStoreSnapshot } from "tldraw"

export type SaveStatus = "saved" | "saving" | "unsaved" | "error"

export interface SavedBoard {
  id: string
  /** The board's saved tldraw document (`getSnapshot(store).document`), or null for a new board. */
  snapshot: unknown | null
}

const SAVE_DEBOUNCE_MS = 1200
const RETRY_MS = 5000

/**
 * Loads a saved board into the editor, then autosaves document changes
 * (the student's drawing and the AI tutor's alike) to /api/whiteboards/[id].
 * Only the document is stored; camera and selection stay per-device.
 * Returns a disposer that flushes any pending save.
 */
export function attachBoardPersistence(
  editor: Editor,
  board: SavedBoard,
  onStatus: (status: SaveStatus) => void
): () => void {
  if (board.snapshot && typeof board.snapshot === "object") {
    try {
      loadSnapshot(editor.store, { document: board.snapshot as TLStoreSnapshot })
    } catch (err) {
      console.error("[whiteboard] could not load saved board", err)
      onStatus("error")
    }
  }

  let timer: number | undefined
  let inFlight = false
  let dirty = false
  let disposed = false

  const save = async (keepalive = false) => {
    window.clearTimeout(timer)
    if (!dirty) return
    if (inFlight && !keepalive) {
      timer = window.setTimeout(() => void save(), SAVE_DEBOUNCE_MS)
      return
    }
    dirty = false
    inFlight = true
    if (!disposed) onStatus("saving")
    try {
      const res = await fetch(`/api/whiteboards/${board.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ snapshot: getSnapshot(editor.store).document }),
        keepalive,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!disposed) onStatus(dirty ? "unsaved" : "saved")
    } catch (err) {
      console.error("[whiteboard] autosave failed", err)
      dirty = true
      if (!disposed) {
        onStatus("error")
        timer = window.setTimeout(() => void save(), RETRY_MS)
      }
    } finally {
      inFlight = false
    }
  }

  const stopListening = editor.store.listen(
    () => {
      dirty = true
      onStatus("unsaved")
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void save(), SAVE_DEBOUNCE_MS)
    },
    { scope: "document", source: "all" }
  )

  // Best-effort flush when the tab is hidden or closed.
  const onHide = () => {
    if (document.visibilityState === "hidden") void save(true)
  }
  document.addEventListener("visibilitychange", onHide)

  return () => {
    stopListening()
    document.removeEventListener("visibilitychange", onHide)
    void save(true)
    disposed = true
  }
}
