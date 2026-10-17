import { MAX_SOURCE_IMAGE_BYTES, type QuestionSource } from "@/lib/ai/question-source"

type EncodedImage = NonNullable<QuestionSource["image"]>

/** Crop of the source image, as fractions 0-1 of its width/height (tldraw's crop format). */
export interface ImageCrop { topLeft: { x: number; y: number }; bottomRight: { x: number; y: number } }

export interface EncodeOptions {
  /** Longest side in pixels; larger images are scaled down, smaller ones are never scaled up. */
  maxSide?: number
  /** Try lossless PNG first (crisp thin lines for diagrams), falling back to JPEG if it's too big. */
  preferPng?: boolean
  jpegQuality?: number
  crop?: ImageCrop | null
}

/** The question image the tutor reads: full detail, so it can locate diagram parts precisely. */
export const QUESTION_IMAGE: EncodeOptions = { maxSide: 2048, preferPng: true, jpegQuality: 0.92 }
/** Context-only pictures of the board (the student's own working): smaller and cheaper. */
export const CONTEXT_IMAGE: EncodeOptions = { maxSide: 1024, preferPng: false, jpegQuality: 0.8 }

const bytesOf = (base64: string) => (base64.length * 3) / 4

/** Re-encodes an already-loaded image into a `QuestionSource["image"]`, at its own resolution where possible. */
function encode(image: HTMLImageElement, options: EncodeOptions): EncodedImage {
  const crop = options.crop
  const sx = crop ? crop.topLeft.x * image.naturalWidth : 0
  const sy = crop ? crop.topLeft.y * image.naturalHeight : 0
  const sw = crop ? (crop.bottomRight.x - crop.topLeft.x) * image.naturalWidth : image.naturalWidth
  const sh = crop ? (crop.bottomRight.y - crop.topLeft.y) * image.naturalHeight : image.naturalHeight
  const ratio = Math.min(1, (options.maxSide ?? 2048) / Math.max(sw, sh))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(sw * ratio))
  canvas.height = Math.max(1, Math.round(sh * ratio))
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Couldn't read this image.")
  ctx.fillStyle = "white"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

  const size = { width: canvas.width, height: canvas.height }
  if (options.preferPng) {
    const png = canvas.toDataURL("image/png").split(",")[1]
    if (bytesOf(png) <= MAX_SOURCE_IMAGE_BYTES) return { mimeType: "image/png", data: png, ...size }
  }
  for (const quality of [options.jpegQuality ?? 0.9, 0.8, 0.7]) {
    const jpeg = canvas.toDataURL("image/jpeg", quality).split(",")[1]
    if (bytesOf(jpeg) <= MAX_SOURCE_IMAGE_BYTES) return { mimeType: "image/jpeg", data: jpeg, ...size }
  }
  throw new Error("Crop the image to just the question and try again.")
}

export async function readImageUrl(url: string, options: EncodeOptions = QUESTION_IMAGE): Promise<EncodedImage> {
  const image = new Image()
  image.crossOrigin = "anonymous"
  image.src = url
  await image.decode()
  return encode(image, options)
}

export async function readQuestionImage(file: File): Promise<EncodedImage> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Use a PNG, JPG or WebP image. For a PDF, upload a screenshot of the question.")
  if (file.size > 10_000_000) throw new Error("Choose an image smaller than 10 MB.")
  const url = URL.createObjectURL(file)
  try { return await readImageUrl(url, QUESTION_IMAGE) } finally { URL.revokeObjectURL(url) }
}

/** Same pipeline, for a blob exported from the live board (a snapshot of an area). */
export async function readQuestionImageBlob(blob: Blob, options: EncodeOptions = QUESTION_IMAGE): Promise<EncodedImage> {
  const url = URL.createObjectURL(blob)
  try { return await readImageUrl(url, options) } finally { URL.revokeObjectURL(url) }
}
