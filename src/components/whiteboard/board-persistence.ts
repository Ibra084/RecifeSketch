import { getSnapshot, loadSnapshot, type Editor, type TLStoreSnapshot } from "tldraw"
import { writeBoardCache } from "./board-cache"
import { createInlineImageMover } from "./board-images"

export type SaveStatus = "saved" | "saving" | "unsaved" | "error"

export interface SavedBoard {
  id: string
  /** The board's saved tldraw document (`getSnapshot(store).document`), or null for a new board. */
  snapshot: unknown | null
  /** When the server last saved it (null for a new board). */
  updatedAt: string | null
  /** The snapshot is newer than the server's copy (restored from this browser's cache): upload it straight away. */
  needsSync?: boolean
}

/** Local copy: written almost immediately, so a closed tab loses at most this much. */
const CACHE_DEBOUNCE_MS = 250
const SAVE_DEBOUNCE_MS = 1200
const RETRY_MS = 5000
/** Browsers refuse keepalive requests over 64 KB; bigger boards rely on the local copy when the tab closes. */
const KEEPALIVE_LIMIT = 60_000

/**
 * Loads a saved board into the editor, then saves every document change
 * (the student's drawing and the AI tutor's alike) twice over: to this
 * browser's cache within a moment, and to /api/whiteboards/[id] shortly
 * after. The cache copy stays marked unsaved until the server confirms, so
 * work survives a closed tab, a dropped connection or a failed upload, and is
 * restored and uploaded the next time the board opens. Only the document is
 * stored; camera and selection stay per-device. Returns a disposer that
 * flushes anything pending.
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

  let serverUpdatedAt = board.updatedAt
  let saveTimer: number | undefined
  let cacheTimer: number | undefined
  let inFlight = false
  /** Bumped on every change; a save only counts as complete if nothing changed while it was uploading. */
  let revision = 0
  let savedRevision = board.needsSync ? -1 : 0
  let disposed = false

  const boardDocument = () => getSnapshot(editor.store).document
  const dirty = () => savedRevision !== revision
  const status = (s: SaveStatus) => { if (!disposed) onStatus(s) }

  const cacheNow = () => {
    window.clearTimeout(cacheTimer)
    void writeBoardCache(board.id, { snapshot: boardDocument(), dirty: dirty(), serverUpdatedAt })
  }

  const save = async (leaving = false) => {
    window.clearTimeout(saveTimer)
    if (!dirty()) return
    if (inFlight && !leaving) {
      saveTimer = window.setTimeout(() => void save(), SAVE_DEBOUNCE_MS)
      return
    }
    const uploading = revision
    const body = JSON.stringify({ snapshot: boardDocument() })
    inFlight = true
    status("saving")
    try {
      const res = await fetch(`/api/whiteboards/${board.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body,
        keepalive: leaving && body.length < KEEPALIVE_LIMIT,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json().catch(() => ({}))) as { updatedAt?: string }
      if (json.updatedAt) serverUpdatedAt = json.updatedAt
      savedRevision = Math.max(savedRevision, uploading)
      // Record the confirmed save locally (still dirty if they kept drawing meanwhile).
      cacheNow()
      status(dirty() ? "unsaved" : "saved")
      if (dirty() && !disposed) saveTimer = window.setTimeout(() => void save(), SAVE_DEBOUNCE_MS)
    } catch (err) {
      console.error("[whiteboard] autosave failed; the change is kept in this browser and will retry", err)
      if (!disposed) {
        status("error")
        saveTimer = window.setTimeout(() => void save(), RETRY_MS)
      }
    } finally {
      inFlight = false
    }
  }

  // Images embedded in the board (older boards, the attached question photo) move to storage,
  // so the board's saved data stays small enough to save.
  const moveInlineImages = createInlineImageMover(editor, board.id)
  moveInlineImages()

  const stopListening = editor.store.listen(
    (entry) => {
      if (Object.values(entry.changes.added).some((record) => record.typeName === "asset")) moveInlineImages()
      revision++
      status("unsaved")
      window.clearTimeout(cacheTimer)
      cacheTimer = window.setTimeout(cacheNow, CACHE_DEBOUNCE_MS)
      window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => void save(), SAVE_DEBOUNCE_MS)
    },
    { scope: "document", source: "all" }
  )

  // Restored unsaved work from this browser: upload it now.
  if (board.needsSync) {
    status("unsaved")
    void save()
  }

  // Leaving the tab or closing it: write the local copy at once and try a final upload.
  const flush = () => {
    if (!dirty()) return
    cacheNow()
    void save(true)
  }
  const onHide = () => { if (document.visibilityState === "hidden") flush() }
  const onOnline = () => { if (dirty()) void save() }
  document.addEventListener("visibilitychange", onHide)
  window.addEventListener("pagehide", flush)
  window.addEventListener("online", onOnline)

  return () => {
    stopListening()
    document.removeEventListener("visibilitychange", onHide)
    window.removeEventListener("pagehide", flush)
    window.removeEventListener("online", onOnline)
    flush()
    disposed = true
  }
}
