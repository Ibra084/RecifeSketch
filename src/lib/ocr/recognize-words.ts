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
 * A map of where the image has ink - anything clearly darker than its paper.
 * The threshold follows the paper's own brightness (the median), so a grey
 * photo background isn't mistaken for ink. Up to 1000 cells across, and each
 * cell keeps the DARKEST pixel it covers (sampled at twice the grid's
 * resolution), so a thin string or outline isn't averaged away into the paper.
 */
function inkGrid(bitmap: ImageBitmap, maxCols = 1000): InkGrid | undefined {
  const cols = Math.max(1, Math.min(maxCols, bitmap.width))
  const rows = Math.max(1, Math.round((cols * bitmap.height) / bitmap.width))
  const k = bitmap.width >= cols * 2 ? 2 : 1
  const canvas = document.createElement("canvas")
  canvas.width = cols * k
  canvas.height = rows * k
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return undefined
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const luma = new Float32Array(cols * rows).fill(255)
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4
      const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      const cell = Math.floor(y / k) * cols + Math.floor(x / k)
      if (v < luma[cell]) luma[cell] = v
    }
  }
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
