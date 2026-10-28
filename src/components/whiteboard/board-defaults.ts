import { DefaultDashStyle, DefaultSizeStyle, type Editor } from "tldraw"
import { AI_AUTHORED_META } from "@/lib/drawing/authorship"

/** Students start with a clean solid line at the small size (tldraw's own default is a sketchy medium line). */
export function applyPenDefaults(editor: Editor) {
  editor.setStyleForNextShapes(DefaultDashStyle, "solid")
  editor.setStyleForNextShapes(DefaultSizeStyle, "s")
}

/** Widest a pasted picture lands on the board (page units). The tutor's writing is sized for about this scale. */
export const MAX_PASTED_IMAGE_WIDTH = 800

/**
 * A pasted screenshot arrives at its full pixel size (often 2500+ wide), which
 * dwarfed the tutor's labels and working beside it. Shrink the student's own
 * pasted pictures, about their centre, to a readable width; images the tutor
 * places (question sheets, copied figures) already choose their own size.
 */
export function fitPastedImages(editor: Editor): () => void {
  return editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
    if (shape.type !== "image" || shape.meta[AI_AUTHORED_META] || shape.meta.recifeQuestionSource) return
    const { w, h } = shape.props as { w: number; h: number }
    if (w <= MAX_PASTED_IMAGE_WIDTH) return
    const scale = MAX_PASTED_IMAGE_WIDTH / w
    editor.updateShape({
      id: shape.id, type: "image",
      x: shape.x + (w - w * scale) / 2, y: shape.y + (h - h * scale) / 2,
      props: { w: w * scale, h: h * scale },
    })
  })
}

/**
 * The eraser never removes a picture. tldraw hit-tests an image as a solid
 * rectangle, so rubbing out working written on a pasted question deleted the
 * question itself. Images can still be removed by selecting them and pressing Delete.
 */
export function keepImagesFromEraser(editor: Editor): () => void {
  return editor.sideEffects.registerBeforeChangeHandler("instance_page_state", (_prev, next) => {
    if (next.erasingShapeIds.length === 0) return next
    const kept = next.erasingShapeIds.filter((id) => editor.getShape(id)?.type !== "image")
    return kept.length === next.erasingShapeIds.length ? next : { ...next, erasingShapeIds: kept }
  })
}
