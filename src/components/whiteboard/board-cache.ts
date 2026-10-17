/**
 * A copy of each saved board kept in this browser (IndexedDB), written within
 * a moment of every change. The server copy is the real save; this one only
 * matters when the server copy is behind - the tab closed before an upload
 * finished, the connection dropped, or an older copy of the page was served.
 * Every call fails soft: no IndexedDB (private mode, blocked storage) just
 * means no local copy.
 */

export interface CachedBoard {
  /** The board's tldraw document. */
  snapshot: unknown
  /** True while this copy has changes the server hasn't confirmed saving. */
  dirty: boolean
  /** The server's updated_at for the last save this copy was confirmed against. */
  serverUpdatedAt: string | null
}

export interface StartingBoard {
  snapshot: unknown | null
  /** The chosen copy is newer than the server's, so it must be uploaded straight away. */
  needsSync: boolean
}

/**
 * Which copy to open: unsaved local changes always win (that's the work that
 * would otherwise be lost); a clean local copy wins only if it was confirmed
 * against a newer server save than the page was rendered with (a stale page).
 */
export function chooseStartingBoard(
  server: { snapshot: unknown | null; updatedAt: string | null },
  cached: CachedBoard | undefined
): StartingBoard {
  if (!cached) return { snapshot: server.snapshot, needsSync: false }
  if (cached.dirty) return { snapshot: cached.snapshot, needsSync: true }
  const cachedAt = cached.serverUpdatedAt ? Date.parse(cached.serverUpdatedAt) : NaN
  const serverAt = server.updatedAt ? Date.parse(server.updatedAt) : NaN
  if (cachedAt > serverAt) return { snapshot: cached.snapshot, needsSync: false }
  return { snapshot: server.snapshot, needsSync: false }
}

const DB = "recife-sketch"
const STORE = "boards"

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await open()
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode)
      const request = run(tx.objectStore(STORE))
      tx.oncomplete = () => { db.close(); resolve(request.result) }
      tx.onerror = tx.onabort = () => { db.close(); resolve(undefined) }
    } catch {
      db.close()
      resolve(undefined)
    }
  })
}

export function readBoardCache(id: string): Promise<CachedBoard | undefined> {
  return withStore<CachedBoard | undefined>("readonly", (store) => store.get(id) as IDBRequest<CachedBoard | undefined>)
}

export async function writeBoardCache(id: string, entry: CachedBoard): Promise<void> {
  await withStore("readwrite", (store) => store.put(entry, id))
}

export async function deleteBoardCache(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id))
}
