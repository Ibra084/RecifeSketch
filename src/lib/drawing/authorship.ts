/** Shape meta key set on everything the tutor draws (see TldrawDrawingAdapter.authored). */
export const AI_AUTHORED_META = "recifeAi"

/**
 * True for shapes the student made themselves - handwriting, sketches,
 * pasted images - as opposed to anything the tutor drew or a question
 * the student explicitly attached (which is already sent on its own).
 */
export function isStudentShape(shape: { type: string; meta: Record<string, unknown> }): boolean {
  const meta = shape.meta
  return !(
    meta[AI_AUTHORED_META] ||
    meta.recifeObjectId ||
    meta.recifeLabelOwner ||
    meta.recifeQuestionSource
  )
}

/**
 * The student work a "where did I go wrong?" question is most likely about:
 * their selection, else what's in view, else everything. Narrowing the
 * snapshot makes the relevant lines fill more of the image, so the model's
 * fractional coordinates land far more precisely on the page.
 */
export function focusedStudentWork<T extends { type: string; meta: Record<string, unknown> }>(shapes: {
  selected: T[]
  visible: T[]
  all: T[]
}): T[] {
  for (const group of [shapes.selected, shapes.visible, shapes.all]) {
    const student = group.filter(isStudentShape)
    if (student.length > 0) return student
  }
  return []
}
