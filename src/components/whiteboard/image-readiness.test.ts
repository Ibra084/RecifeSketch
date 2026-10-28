import { describe, expect, it } from "vitest"
import type { Editor, TLShapeId } from "tldraw"
import { waitForImages } from "./image-readiness"

/** Just enough of an editor: one image shape whose asset's link appears after `uploadMs` (never, if null). */
function fakeEditor(uploadMs: number | null) {
  const start = Date.now()
  const id = "shape:img" as TLShapeId
  const editor = {
    getShapeAndDescendantIds: (ids: TLShapeId[]) => new Set(ids),
    getShape: (shapeId: TLShapeId) => (shapeId === id ? { id, type: "image", props: { assetId: "asset:a" } } : undefined),
    getAsset: () => ({ props: { src: uploadMs !== null && Date.now() - start >= uploadMs ? "/api/board-images/x.png" : "" } }),
    resolveAssetUrl: async () => null,
  }
  return { editor: editor as unknown as Editor, id }
}

describe("waitForImages", () => {
  it("waits for a just-pasted picture to finish uploading", async () => {
    const { editor, id } = fakeEditor(300)
    const started = Date.now()
    expect(await waitForImages(editor, [id], 2000)).toBe(true)
    expect(Date.now() - started).toBeGreaterThanOrEqual(250)
  })

  it("gives up (false) if the upload never finishes", async () => {
    const { editor, id } = fakeEditor(null)
    expect(await waitForImages(editor, [id], 300)).toBe(false)
  })

  it("ignores shapes that aren't pictures", async () => {
    const { editor } = fakeEditor(null)
    expect(await waitForImages(editor, ["shape:pen" as TLShapeId], 300)).toBe(true)
  })
})
