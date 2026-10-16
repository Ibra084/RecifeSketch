"use client"

/**
 * Reads the printed words in an image, with each word's exact pixel box,
 * using Tesseract (OCR) running in the student's own browser - the image is
 * never uploaded anywhere for this. The recognition model is fetched once
 * and the worker kept for later questions.
 */

import type { OcrResult, OcrWord } from "@/lib/drawing/text-match"

type TesseractWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>

let worker: Promise<TesseractWorker> | null = null

function getWorker(): Promise<TesseractWorker> {
  // Loaded on first use only, so the OCR engine never weighs down the page until a question image needs it.
  worker ??= import("tesseract.js").then(({ createWorker }) => createWorker("eng"))
  worker.catch(() => { worker = null })
  return worker
}

/** Words in the image with their pixel boxes, or null if OCR couldn't run (offline, unsupported browser). */
export async function recognizeWords(image: Blob): Promise<OcrResult | null> {
  try {
    const bitmap = await createImageBitmap(image)
    const size = { width: bitmap.width, height: bitmap.height }
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
    return { ...size, words }
  } catch {
    return null
  }
}
