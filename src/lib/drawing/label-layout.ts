export interface LabelBox { x: number; y: number; w: number; h: number }

function overlaps(a: LabelBox, b: LabelBox, gap = 8) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap && a.y + a.h + gap > b.y
}

/** Labels are outside symbols, with measured dimensions and deterministic spacing. */
export function placeLabel(owner: LabelBox, size: { w: number; h: number }, occupied: LabelBox[], above = false): LabelBox {
  size = { w: size.w, h: size.h }
  for (let ring = 0; ring < 24; ring++) {
    const gap = 14 + ring * (size.h + 12)
    const candidates = [
      { x: owner.x + (owner.w - size.w) / 2, y: owner.y + owner.h + gap, ...size },
      { x: owner.x + (owner.w - size.w) / 2, y: owner.y - size.h - gap, ...size },
      { x: owner.x + owner.w + gap, y: owner.y + (owner.h - size.h) / 2, ...size },
      { x: owner.x - size.w - gap, y: owner.y + (owner.h - size.h) / 2, ...size },
    ]
    if (above) [candidates[0], candidates[1]] = [candidates[1], candidates[0]]
    const clear = candidates.find(candidate => !occupied.some(box => overlaps(candidate, box)))
    if (clear) return clear
  }
  // A crowded diagram still gets readable text in an unoccupied margin.
  return { x: owner.x, y: Math.max(owner.y + owner.h, ...occupied.map(box => box.y + box.h)) + 20, ...size }
}
