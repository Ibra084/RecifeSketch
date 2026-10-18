import type { InkGrid } from "./text-match"

type Box = [number, number, number, number]

/** Local background comparison rejects smooth shadows and faint ruled paper.
 * Integral sums keep the work linear in the image size, without native libraries. */
export function adaptiveInk(luma: ArrayLike<number>, cols: number, rows: number): InkGrid {
  const stride = cols + 1
  const sums = new Float64Array(stride * (rows + 1))
  for (let y = 0; y < rows; y++) {
    let sum = 0
    for (let x = 0; x < cols; x++) {
      sum += luma[y * cols + x]
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + sum
    }
  }
  const radius = Math.max(5, Math.round(Math.min(cols, rows) / 40))
  const cells = new Uint8Array(cols * rows)
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const x0 = Math.max(0, x - radius), x1 = Math.min(cols, x + radius + 1)
    const y0 = Math.max(0, y - radius), y1 = Math.min(rows, y + radius + 1)
    const mean = (sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0))
    cells[y * cols + x] = luma[y * cols + x] < mean - 28 ? 1 : 0
  }
  return { cols, rows, cells }
}

/** Refine only when a complete, unambiguous connected feature matches the guess.
 * Do not truncate connected lines at the search boundary and call that a feature.
 * Attached/ambiguous geometry deliberately retains the model box. */
export function refineImageBox(box: readonly number[], ink?: InkGrid): Box {
  const original: Box = [box[0], box[1], box[2], box[3]]
  if (!ink) return original
  const { cols, rows, cells } = ink
  const left = box[1] * cols / 1000, right = box[3] * cols / 1000
  const top = box[0] * rows / 1000, bottom = box[2] * rows / 1000
  const w = Math.max(1, right - left), h = Math.max(1, bottom - top)
  const x0 = Math.max(0, Math.floor(left - w * .4)), x1 = Math.min(cols - 1, Math.ceil(right + w * .4))
  const y0 = Math.max(0, Math.floor(top - h * .4)), y1 = Math.min(rows - 1, Math.ceil(bottom + h * .4))
  const seen = new Set<number>()
  const candidates: { box: Box; score: number }[] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const seed = y * cols + x
    if (!cells[seed] || seen.has(seed)) continue
    const queue = [seed]; seen.add(seed)
    let minX = x, maxX = x, minY = y, maxY = y, clipped = false
    for (let i = 0; i < queue.length; i++) {
      const cy = Math.floor(queue[i] / cols), cx = queue[i] % cols
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx)
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !cells[ny * cols + nx]) continue
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) { clipped = true; continue }
        const n = ny * cols + nx
        if (!seen.has(n)) { seen.add(n); queue.push(n) }
      }
    }
    const cw = maxX + 1 - minX, ch = maxY + 1 - minY
    if (clipped || queue.length < 3 || cw < w * .45 || ch < h * .45 || cw > w * 1.6 || ch > h * 1.6) continue
    const intersection = Math.max(0, Math.min(right, maxX + 1) - Math.max(left, minX)) * Math.max(0, Math.min(bottom, maxY + 1) - Math.max(top, minY))
    const score = intersection / (w * h + cw * ch - intersection)
    if (score >= .4) candidates.push({ box: [minY / rows * 1000, minX / cols * 1000, (maxY + 1) / rows * 1000, (maxX + 1) / cols * 1000], score })
  }
  candidates.sort((a, b) => b.score - a.score)
  if (candidates[0] && (!candidates[1] || candidates[0].score - candidates[1].score > .15)) return candidates[0].box
  // A circle attached to a string is not an isolated ink component. Its
  // enclosed paper region still identifies the contour without including the string.
  seen.clear()
  const holes: { box: Box; score: number }[] = []
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const seed = y * cols + x
    if (cells[seed] || seen.has(seed)) continue
    const queue = [seed]; seen.add(seed)
    let minX = x, maxX = x, minY = y, maxY = y, open = false
    for (let i = 0; i < queue.length; i++) {
      const cy = Math.floor(queue[i] / cols), cx = queue[i] % cols
      minX = Math.min(minX, cx); maxX = Math.max(maxX, cx)
      minY = Math.min(minY, cy); maxY = Math.max(maxY, cy)
      if (cx === x0 || cx === x1 || cy === y0 || cy === y1) open = true
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue
        const n = ny * cols + nx
        if (!cells[n] && !seen.has(n)) { seen.add(n); queue.push(n) }
      }
    }
    if (open) continue
    minX = Math.max(0, minX - 1); minY = Math.max(0, minY - 1)
    maxX = Math.min(cols, maxX + 2); maxY = Math.min(rows, maxY + 2)
    const cw = maxX - minX, ch = maxY - minY
    const intersection = Math.max(0, Math.min(right, maxX) - Math.max(left, minX)) * Math.max(0, Math.min(bottom, maxY) - Math.max(top, minY))
    const score = intersection / (w * h + cw * ch - intersection)
    if (score >= .6 && cw >= w * .6 && ch >= h * .6) holes.push({ box: [minY / rows * 1000, minX / cols * 1000, maxY / rows * 1000, maxX / cols * 1000], score })
  }
  holes.sort((a, b) => b.score - a.score)
  return holes[0] && (!holes[1] || holes[0].score - holes[1].score > .15) ? holes[0].box : original
}
