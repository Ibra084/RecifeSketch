import { createShapeId, type Editor, type TLShape, type TLShapeId } from "tldraw"
import type { DrawingColor } from "./protocol"
import { placeArrowLabel, placeLabel, type LabelBox } from "./label-layout"
import { MATH_SHAPE_TYPE, measureMath, type MathShape } from "./math-shape"

const LABEL_SIZE = "s" as const

/**
 * A shape's or arrow's label: typeset like the rest of the tutor's writing
 * (so "F_{\text{pull}}" reads as maths, on a solid backing), and
 * persistently owned by its symbol through shape metadata.
 */
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

  /** The owner's label - a typeset label, or a plain-text one from a board made before labels were typeset. */
  get(owner: TLShapeId) {
    const shape = this.editor.getShape(createShapeId(`${owner}:label`))
    return (shape?.type === MATH_SHAPE_TYPE || shape?.type === "text") && shape.meta.recifeLabelOwner === owner ? shape : undefined
  }

  /** The label's text, whichever kind of shape holds it. */
  textOf(owner: TLShapeId): string | undefined {
    const label = this.get(owner)
    return label?.type === MATH_SHAPE_TYPE ? label.props.text : undefined
  }

  set(owner: TLShapeId, text: string, color: DrawingColor = "black") {
    const existing = this.get(owner)
    const size = measureMath(this.editor, text, "mixed", LABEL_SIZE, 0)
    const props = { text, mode: "mixed" as const, color, size: LABEL_SIZE, maxW: 0, ...size }
    if (existing?.type === MATH_SHAPE_TYPE) {
      this.editor.updateShape<MathShape>({ id: existing.id, type: MATH_SHAPE_TYPE, props })
    } else {
      // An old plain-text label is replaced by a typeset one.
      if (existing) this.editor.deleteShapes([existing.id])
      this.editor.createShapes<MathShape>([{ id: createShapeId(`${owner}:label`), type: MATH_SHAPE_TYPE, x: 0, y: 0,
        meta: { recifeLabelOwner: owner }, props }])
    }
    this.layout()
  }

  layout() {
    if (this.layingOut) return
    this.layingOut = true
    try {
      const shapes = this.editor.getCurrentPageShapes()
      // Arrow labels first: each has one natural spot (just past its arrowhead), while a shape's label
      // can sit on any side - so shapes' labels fit around the arrows', not the other way round.
      const isArrowLabel = (label: TLShape) => this.editor.getShape(label.meta.recifeLabelOwner as TLShapeId)?.type === "arrow"
      const labels = shapes.filter(shape => typeof shape.meta.recifeLabelOwner === "string")
        .sort((a, b) => Number(isArrowLabel(b)) - Number(isArrowLabel(a)) || a.id.localeCompare(b.id))
      const others = shapes.filter(shape => !shape.meta.recifeLabelOwner)
        .flatMap(shape => { const box = this.editor.getShapePageBounds(shape); return box ? [{ shape, box }] : [] })
      const placedLabels: LabelBox[] = []
      for (const label of labels) {
        const owner = this.editor.getShape(label.meta.recifeLabelOwner as TLShapeId)
        if (!owner) continue // keep the label record available for owner undo/redo
        const bounds = this.editor.getShapePageBounds(owner)
        const size = this.editor.getShapePageBounds(label)
        if (!bounds || !size) continue
        const blockedBy = (exclude?: TLShapeId) => (box: LabelBox) =>
          placedLabels.some(other => boxesOverlap(box, other, 6)) ||
          others.some(other => other.shape.id !== exclude && this.covers(other.shape, other.box, box))
        let placed: LabelBox | undefined
        if (owner.type === "arrow") {
          // Past the arrowhead; the arrow itself isn't an obstacle to its own label.
          const tip = { x: owner.x + owner.props.end.x, y: owner.y + owner.props.end.y }
          const tail = { x: owner.x + owner.props.start.x, y: owner.y + owner.props.start.y }
          placed = placeArrowLabel(tail, tip, size, blockedBy(owner.id))
        }
        placed ??= placeLabel(bounds, size, blockedBy(), owner.type === "arrow")
        placedLabels.push(placed)
        const target = this.editor.getPointInParentSpace(label, placed)
        if (Math.abs(label.x - target.x) > 0.1 || Math.abs(label.y - target.y) > 0.1) {
          this.editor.updateShape({ id: label.id, type: label.type, x: target.x, y: target.y })
        }
      }
    } finally { this.layingOut = false }
  }

  /**
   * Whether a label box would cover a shape. Thin strokes (lines, polygons,
   * arrows, sketches, apparatus) only block where their outline actually runs - so a
   * label can sit inside an open triangle beside a slope - while solid
   * symbols and text block their whole box.
   */
  private covers(shape: TLShape, shapeBox: LabelBox, box: LabelBox): boolean {
    if (!boxesOverlap(box, shapeBox, 6)) return false
    // An image (a question photo, a copied figure) is a background to annotate on: labels, with their
    // solid backing, may sit over it - otherwise every label on a copied figure is pushed off it.
    if (shape.type === "image") return false
    // Apparatus (a group of outlines) counts as thin strokes too, so labels can sit in its open spaces.
    if (shape.type !== "line" && shape.type !== "draw" && shape.type !== "arrow" && shape.type !== "group") return true
    const pad = 6
    const corners = [
      { x: box.x - pad, y: box.y - pad }, { x: box.x + box.w + pad, y: box.y - pad },
      { x: box.x + box.w + pad, y: box.y + box.h + pad }, { x: box.x - pad, y: box.y + box.h + pad },
    ].map(point => this.editor.getPointInShapeSpace(shape, point))
    const geometry = this.editor.getShapeGeometry(shape)
    // An edge of the box crosses the stroke, or the stroke lies wholly inside the box.
    return corners.some((a, i) => geometry.hitTestLineSegment(a, corners[(i + 1) % 4], 2)) ||
      boxesOverlap(shapeBox, box, 0) && shapeBox.x >= box.x && shapeBox.y >= box.y &&
      shapeBox.x + shapeBox.w <= box.x + box.w && shapeBox.y + shapeBox.h <= box.y + box.h
  }
}

function boxesOverlap(a: LabelBox, b: LabelBox, gap: number) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}
