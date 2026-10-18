import type { Editor, TLAsset, TLAssetStore } from "tldraw"

/**
 * Pasted images live in the student's private storage folder, not inside the
 * board's saved data (which made every save megabytes long and time out).
 * The board keeps only a short link (/api/board-images/...).
 */

async function upload(boardId: string, file: Blob): Promise<string> {
  const body = new FormData()
  body.append("file", file)
  const response = await fetch(`/api/board-images?board=${encodeURIComponent(boardId)}`, { method: "POST", body })
  if (!response.ok) throw new Error(`image upload failed: HTTP ${response.status}`)
  const { src } = (await response.json()) as { src?: string }
  if (!src) throw new Error("image upload failed: no link returned")
  return src
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** tldraw's asset store for a saved board: new images go to storage; links resolve as-is. */
export function boardAssetStore(boardId: string): TLAssetStore {
  return {
    async upload(_asset, file) {
      try {
        return { src: await upload(boardId, file) }
      } catch (err) {
        // Storage unavailable (offline, or not set up yet): keep the image in the board rather than
        // refusing the paste. It's moved to storage automatically the next time the board opens.
        console.warn("[whiteboard] couldn't store the image yet; keeping it in the board for now", err)
        return { src: await readAsDataUrl(file) }
      }
    },
    resolve(asset) {
      return asset.props.src
    },
  }
}

const isInlineImage = (asset: TLAsset) =>
  (asset.type === "image" || asset.type === "video") && typeof asset.props.src === "string" && asset.props.src.startsWith("data:")

/**
 * Uploads in progress or done, shared by every editor on the page: the same
 * embedded image is only ever uploaded once, even when the whiteboard mounts
 * twice (React does that in development) or the mover runs again mid-upload.
 */
const uploads = new Map<string, Promise<string>>()
const uploadKey = (boardId: string, asset: TLAsset) =>
  `${boardId}:${asset.id}:${asset.props.src!.length}:${asset.props.src!.slice(-64)}`

/**
 * Moves every image still embedded in the board (older boards, the attached
 * question photo) into storage, swapping in its link. Failures are left
 * embedded and retried the next time it runs.
 */
export function createInlineImageMover(editor: Editor, boardId: string): () => void {
  return () => {
    for (const asset of editor.getAssets()) {
      if (!isInlineImage(asset)) continue
      const key = uploadKey(boardId, asset)
      let pending = uploads.get(key)
      if (!pending) {
        pending = fetch(asset.props.src!).then((r) => r.blob()).then((blob) => upload(boardId, blob))
        uploads.set(key, pending)
        pending.catch(() => uploads.delete(key)) // a failed upload may be retried
      }
      void pending.then(
        (src) => {
          const current = editor.getAsset(asset.id)
          if (current && current.props.src === asset.props.src) {
            editor.updateAssets([{ ...current, props: { ...current.props, src } } as TLAsset])
          }
        },
        (err) => console.warn("[whiteboard] image not moved to storage yet; will retry", err)
      )
    }
  }
}
