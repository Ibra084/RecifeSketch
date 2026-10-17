"use client"

/**
 * Reads the printed words in an image, with each word's exact pixel box,
 * using Tesseract (OCR) running in the student's own browser - the image is
 * never uploaded anywhere for this. The recognition model is fetched once
 * and the worker kept for later questions.
 */

import type { InkGrid, OcrResult, OcrWord } from "@/lib/drawing/text-match"

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>

let worker: Promise<TesseractWorker> | null = null

function getWorker(): Promise<TesseractWorker> {
  // Loaded on first use only, so the OCR engine never weighs down the page until a question image needs it.
  worker ??= import("tesseract.js").then(({ createWorker }) => createWorker("eng"))
  worker.catch(() => { worker = null })
  return worker
}

/**
 * A coarse map of where the image has ink - anything clearly darker than its
 * paper. The threshold follows the paper's own brightness (the median), so a
 * grey photo background isn't mistaken for ink.
 */
function inkGrid(bitmap: ImageBitmap, cols = 250): InkGrid | undefined {
  const rows = Math.max(1, Math.round((cols * bitmap.height) / bitmap.width))
  const canvas = document.createElement("canvas")
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return undefined
  ctx.drawImage(bitmap, 0, 0, cols, rows)
  const { data } = ctx.getImageData(0, 0, cols, rows)
  const luma = new Float32Array(cols * rows)
  for (let i = 0; i < luma.length; i++) luma[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]
  const median = Float32Array.from(luma).sort()[luma.length >> 1]
  const threshold = median - 55
  return { cols, rows, cells: Uint8Array.from(luma, (v) => (v < threshold ? 1 : 0)) }
}

/** Words in the image with their pixel boxes (and where its ink is), or null if OCR couldn't run (offline, unsupported browser). */
export async function recognizeWords(image: Blob): Promise<OcrResult | null> {
  try {
    const bitmap = await createImageBitmap(image)
    const size = { width: bitmap.width, height: bitmap.height }
    const ink = inkGrid(bitmap)
    bitmap.close()
    const tesseract = await getWorker()
    const { data } = await tesseract.recognize(image, {}, { blocks: true })
    const words: OcrWord[] = []
    let line = 0
    for (const block of data.blocks ?? []) {
      for (const paragraph of block.paragraphs) {
        for (const textLine of paragraph.lines) {
          for (const word of textLine.words) {
            // Skip low-confidence noise (smudges, graph lines read as letters).
            if (word.confidence < 30 || !word.text.trim()) continue
            words.push({ text: word.text, x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1, line })
          }
          line++
        }
      }
    }
    return { ...size, words, ...(ink ? { ink } : {}) }
  } catch {
    return null
  }
}
