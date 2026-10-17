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
 * Moves every image still embedded in the board (older boards, the attached
 * question photo) into storage, swapping in its link. Each image is moved at
 * most once at a time; failures are left embedded and retried next time.
 */
export function createInlineImageMover(editor: Editor, boardId: string): () => void {
  const moving = new Set<string>()
  return () => {
    for (const asset of editor.getAssets()) {
      if (!isInlineImage(asset) || moving.has(asset.id)) continue
      moving.add(asset.id)
      void (async () => {
        try {
          const blob = await (await fetch(asset.props.src!)).blob()
          const src = await upload(boardId, blob)
          const current = editor.getAsset(asset.id)
          if (current && current.props.src === asset.props.src) {
            editor.updateAssets([{ ...current, props: { ...current.props, src } } as TLAsset])
          }
        } catch (err) {
          console.warn("[whiteboard] image not moved to storage yet; will retry", err)
        } finally {
          moving.delete(asset.id)
        }
      })()
    }
  }
}
