import { AssetRecordType, createShapeId, toRichText, type Editor, type TLShapeId } from "tldraw"
import type { QuestionSource } from "../ai/question-source"

/** The only imported image is the student's source material; AI annotations remain shapes. */
export function placeQuestionSheet(editor: Editor, source: QuestionSource): TLShapeId {
  const shapes = editor.getCurrentPageShapes()
  const boxes = shapes.flatMap(shape => { const box = editor.getShapePageBounds(shape); return box ? [box] : [] })
  const x = boxes.length ? Math.max(...boxes.map(box => box.x + box.w)) + 120 : 80
  const y = 80
  const id = createShapeId()
  if (source.image) {
    const assetId = AssetRecordType.createId()
    const { image } = source
    const w = Math.min(640, image.width)
    const h = image.height * w / image.width
    editor.createAssets([{ id: assetId, typeName: "asset", type: "image", meta: {}, props: {
      name: "Past-paper question", src: `data:${image.mimeType};base64,${image.data}`,
      w: image.width, h: image.height, mimeType: image.mimeType, isAnimated: false,
    } }])
    editor.createShapes([{ id, type: "image", x, y, isLocked: true,
      meta: { recifeQuestionSource: true }, props: { assetId, w, h } }])
  } else {
    editor.createShapes([{ id, type: "text", x, y, isLocked: true, meta: { recifeQuestionSource: true },
      props: { richText: toRichText(source.text ?? ""), w: 600, autoSize: false, font: "sans", size: "s" } }])
  }
  const bounds = editor.getShapePageBounds(id)
  if (bounds) editor.zoomToBounds({ x: bounds.x - 40, y: bounds.y - 40, w: bounds.w + 620, h: Math.max(bounds.h + 80, 700) })
  return id
}

/**
 * Finds an image the student placed on the board directly (paste, drag-drop
 * - tldraw's own built-in gestures, never disabled by this app) that hasn't
 * already been shared with the AI as question material. Without this, a
 * student who pastes a photo of a question and just asks "solve this" gets
 * an AI that has no idea the image exists at all, since the structured
 * board context only ever covers AI-created objects.
 */
export function findUnattachedQuestionImage(editor: Editor): TLShapeId | undefined {
  const shape = editor
    .getCurrentPageShapes()
    .find((shape) => shape.type === "image" && !shape.meta.recifeQuestionSource)
  return shape?.id
}

/** Tags a board image as shared with the AI, so it isn't re-exported/re-detected on every later turn. */
export function markQuestionSourceAttached(editor: Editor, id: TLShapeId): void {
  const shape = editor.getShape(id)
  if (!shape) return
  editor.updateShape({ id, type: shape.type, meta: { ...shape.meta, recifeQuestionSource: true } })
}
