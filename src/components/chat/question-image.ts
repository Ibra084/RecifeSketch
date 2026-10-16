import { MAX_SOURCE_IMAGE_BYTES, type QuestionSource } from "@/lib/ai/question-source"

/** Downscales, re-encodes and validates an already-loaded image element into a `QuestionSource["image"]`. */
function encodeQuestionImage(image: HTMLImageElement): NonNullable<QuestionSource["image"]> {
  const ratio = Math.min(1, 1800 / Math.max(image.width, image.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.width * ratio))
  canvas.height = Math.max(1, Math.round(image.height * ratio))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Couldn't read this image.")
  ctx.fillStyle = "white"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const data = canvas.toDataURL("image/jpeg", 0.9).split(",")[1]
  if (data.length * 3 / 4 > MAX_SOURCE_IMAGE_BYTES) throw new Error("Crop the image to just the question and try again.")
  return { mimeType: "image/jpeg", data, width: canvas.width, height: canvas.height }
}

async function loadAndEncode(url: string): Promise<NonNullable<QuestionSource["image"]>> {
  const image = new Image()
  image.src = url
  await image.decode()
  return encodeQuestionImage(image)
}

export async function readQuestionImage(file: File): Promise<NonNullable<QuestionSource["image"]>> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Use a PNG, JPG or WebP image. For a PDF, upload a screenshot of the question.")
  if (file.size > 10_000_000) throw new Error("Choose an image smaller than 10 MB.")
  const url = URL.createObjectURL(file)
  try { return await loadAndEncode(url) } finally { URL.revokeObjectURL(url) }
}

/** Same pipeline, for a blob exported from the live board (e.g. a student-pasted image) rather than a file upload. */
export async function readQuestionImageBlob(blob: Blob): Promise<NonNullable<QuestionSource["image"]>> {
  const url = URL.createObjectURL(blob)
  try { return await loadAndEncode(url) } finally { URL.revokeObjectURL(url) }
}
