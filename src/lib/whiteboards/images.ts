import "server-only"
import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Images pasted onto whiteboards live in Supabase Storage (private bucket
 * "board-images"), one folder per student and board:
 *   <user id>/<board id>/<random>.<ext>
 * The board's saved data only keeps the link `/api/board-images/<path>`,
 * which the app serves back to the owner. Storage is only ever reached
 * through the server (service role): every route first checks the signed-in
 * student, builds or checks the path against their own id, and the bucket
 * itself is private. The SQL in supabase/migrations/…_board_image_storage.sql
 * adds per-folder policies as a second line of defence.
 */

export const BOARD_IMAGES_BUCKET = "board-images"
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}
/** Public route that serves a stored image back to its owner. */
export const IMAGE_ROUTE = "/api/board-images"

const SAFE_SEGMENT = /^[0-9a-f-]{36}$|^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/i

/** A stored image path is exactly <uuid>/<uuid>/<uuid>.<ext> - nothing else is ever read or written. */
export function isImagePath(path: string): boolean {
  const parts = path.split("/")
  return parts.length === 3 && parts.every((part) => SAFE_SEGMENT.test(part))
}

export async function storeBoardImage(
  supabase: SupabaseClient,
  userId: string,
  boardId: string,
  file: Blob,
  mimeType: string
): Promise<string> {
  const ext = IMAGE_TYPES[mimeType]
  if (!ext) throw new Error("unsupported image type")
  const path = `${userId}/${boardId}/${randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(BOARD_IMAGES_BUCKET).upload(path, file, {
    contentType: mimeType,
    cacheControl: "31536000",
    upsert: false,
  })
  if (error) throw new Error(`storeBoardImage: ${error.message}`)
  return path
}

/** Removes every image stored for one board (when the board is deleted). */
export async function removeBoardImages(supabase: SupabaseClient, userId: string, boardId: string): Promise<void> {
  const folder = `${userId}/${boardId}`
  const { data } = await supabase.storage.from(BOARD_IMAGES_BUCKET).list(folder, { limit: 1000 })
  const paths = (data ?? []).map((file) => `${folder}/${file.name}`)
  if (paths.length > 0) await supabase.storage.from(BOARD_IMAGES_BUCKET).remove(paths)
}

/** Removes every image a student ever stored (when their account is deleted). Needs a client allowed to see the folder. */
export async function removeAllImagesOf(supabase: SupabaseClient, userId: string): Promise<void> {
  const { data: boards } = await supabase.storage.from(BOARD_IMAGES_BUCKET).list(userId, { limit: 1000 })
  for (const board of boards ?? []) await removeBoardImages(supabase, userId, board.name)
}
