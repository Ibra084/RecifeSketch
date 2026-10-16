/**
 * Finds a phrase in text recognised from an image (OCR words, each with its
 * exact pixel box) and returns the pixel rectangles it covers - one per line,
 * so a phrase that wraps onto the next line is highlighted on both. This is
 * what makes keyword highlights exact: the box comes from where the letters
 * actually are, not from an estimate.
 */

export interface OcrWord {
  text: string
  /** Pixel box in the recognised image. */
  x0: number
  y0: number
  x1: number
  y1: number
  /** Which line of text the word is on (words on one line share it). */
  line: number
}

export interface OcrResult {
  /** Size of the recognised image, in pixels. */
  width: number
  height: number
  words: OcrWord[]
}

export interface PixelRect { x: number; y: number; w: number; h: number }

/** Lower case, letters and digits only ("Speed," -> "speed", "6.0°" -> "60"), so punctuation and OCR noise around a word don't matter. */
export function normalizeToken(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "")
}

/** Edit distance, capped: we only ever care whether it's 0, 1 or 2. */
function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) >= cap) return cap
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    previous = current
  }
  return Math.min(previous[b.length], cap)
}

/**
 * An OCR word matches a wanted word exactly, or - for words of 5+ letters -
 * with a small slip (up to 40% of the word, at most 2 edits: e.g. "speeci"
 * for "speed", where "d" was read as "ci"). Short words must match exactly.
 * False matches stay rare because a whole phrase has to match in sequence.
 */
function tokensMatch(found: string, wanted: string): boolean {
  if (found === wanted) return true
  if (wanted.length < 5) return false
  return editDistance(found, wanted) <= Math.min(2, Math.floor(wanted.length * 0.4))
}

/**
 * The pixel rectangles of the `occurrence`-th (1-based) appearance of
 * `phrase`, one per line it spans, or null if it isn't there.
 */
export function findPhrase(ocr: OcrResult, phrase: string, occurrence = 1): PixelRect[] | null {
  const wanted = phrase.split(/\s+/).map(normalizeToken).filter(Boolean)
  const words = ocr.words.map((word) => ({ ...word, token: normalizeToken(word.text) })).filter((word) => word.token)
  if (wanted.length === 0) return null
  let seen = 0
  for (let start = 0; start + wanted.length <= words.length; start++) {
    const run = words.slice(start, start + wanted.length)
    if (!run.every((word, i) => tokensMatch(word.token, wanted[i]))) continue
    if (++seen < occurrence) continue
    // One rectangle per line the phrase covers.
    const lines = new Map<number, PixelRect>()
    for (const word of run) {
      const box = lines.get(word.line)
      const rect = { x: word.x0, y: word.y0, w: word.x1 - word.x0, h: word.y1 - word.y0 }
      lines.set(word.line, box ? union(box, rect) : rect)
    }
    return [...lines.values()]
  }
  return null
}

function union(a: PixelRect, b: PixelRect): PixelRect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

/** Maps a pixel rectangle in the recognised image onto where that image sits on the board. */
export function pixelRectToPage(rect: PixelRect, ocr: Pick<OcrResult, "width" | "height">, region: { x: number; y: number; w: number; h: number }) {
  const sx = region.w / ocr.width
  const sy = region.h / ocr.height
  return { x: region.x + rect.x * sx, y: region.y + rect.y * sy, w: rect.w * sx, h: rect.h * sy }
}
