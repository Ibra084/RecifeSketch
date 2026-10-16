import { createShapeId, toRichText, type Editor, type TLShapeId } from "tldraw"
import type { DrawingColor } from "./protocol"
import { placeLabel, type LabelBox } from "./label-layout"

/** Ordinary editable text, persistently owned by its symbol through shape metadata. */
export class AttachedLabels {
  private layingOut = false
  private readonly disposers: (() => void)[]

  constructor(private readonly editor: Editor) {
    this.disposers = [
      editor.sideEffects.registerAfterChangeHandler("shape", (before, after) => {
        if (before.x !== after.x || before.y !== after.y || before.rotation !== after.rotation || before.props !== after.props) this.layout()
      }),
      editor.sideEffects.registerAfterCreateHandler("shape", () => this.layout()),
      editor.sideEffects.registerAfterDeleteHandler("shape", shape => {
        const label = this.get(shape.id)
        if (label) editor.deleteShapes([label.id])
        this.layout()
      }),
    ]
  }

  dispose() { this.disposers.forEach(dispose => dispose()) }

  get(owner: TLShapeId) {
    const shape = this.editor.getShape(createShapeId(`${owner}:label`))
    return shape?.type === "text" && shape.meta.recifeLabelOwner === owner ? shape : undefined
  }

  set(owner: TLShapeId, text: string, color: DrawingColor = "black") {
    const existing = this.get(owner)
    if (existing) {
      this.editor.updateShape({ id: existing.id, type: "text", props: { richText: toRichText(text), color, autoSize: true } })
    } else {
      this.editor.createShapes([{ id: createShapeId(`${owner}:label`), type: "text", x: 0, y: 0,
        meta: { recifeLabelOwner: owner },
        props: { richText: toRichText(text), font: "sans", size: "s", color, autoSize: true } }])
    }
    this.layout()
  }

  layout() {
    if (this.layingOut) return
    this.layingOut = true
    try {
      const shapes = this.editor.getCurrentPageShapes()
      const labels = shapes.filter(shape => typeof shape.meta.recifeLabelOwner === "string").sort((a, b) => a.id.localeCompare(b.id))
      const occupied: LabelBox[] = shapes.filter(shape => !shape.meta.recifeLabelOwner)
        .flatMap(shape => { const box = this.editor.getShapePageBounds(shape); return box ? [box] : [] })
      for (const label of labels) {
        const owner = this.editor.getShape(label.meta.recifeLabelOwner as TLShapeId)
        if (!owner) continue // keep the label record available for owner undo/redo
        const bounds = this.editor.getShapePageBounds(owner)
        const size = this.editor.getShapePageBounds(label)
        if (!bounds || !size) continue
        const placed = placeLabel(bounds, size, occupied, owner.type === "arrow")
        occupied.push(placed)
        const target = this.editor.getPointInParentSpace(label, placed)
        if (Math.abs(label.x - target.x) > 0.1 || Math.abs(label.y - target.y) > 0.1) {
          this.editor.updateShape({ id: label.id, type: label.type, x: target.x, y: target.y })
        }
      }
    } finally { this.layingOut = false }
  }
}
