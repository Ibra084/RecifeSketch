import type { Editor, TLImageShape, TLShapeId } from "tldraw"

const POLL_MS = 150

function loadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => resolve() // a broken link isn't fixed by waiting
    image.src = url
  })
}

/**
 * Waits until every picture among `ids` (and inside them) has finished
 * uploading and can be drawn. A just-pasted image only has a temporary
 * on-screen preview until its upload completes, so a snapshot taken straight
 * away showed tldraw's "?" placeholder and the tutor said there was no image.
 * Resolves false if they still aren't ready by the deadline.
 */
export async function waitForImages(editor: Editor, ids: Iterable<TLShapeId>, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  const imageIds = [...editor.getShapeAndDescendantIds([...ids])].filter((id) => editor.getShape(id)?.type === "image")
  for (const id of imageIds) {
    for (;;) {
      const shape = editor.getShape<TLImageShape>(id)
      if (!shape) break // deleted meanwhile: nothing to wait for
      const asset = shape.props.assetId ? editor.getAsset(shape.props.assetId) : undefined
      if (shape.props.assetId && asset && typeof asset.props.src === "string" && asset.props.src.length > 0) {
        const url = await editor.resolveAssetUrl(shape.props.assetId, { shouldResolveToOriginal: true })
        if (url) await Promise.race([loadImage(url), new Promise((resolve) => setTimeout(resolve, Math.max(0, deadline - Date.now())))])
        break
      }
      if (Date.now() >= deadline) return false
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
  }
  return Date.now() < deadline
}
