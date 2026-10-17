import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/server"
import { IMAGE_ROUTE, IMAGE_TYPES, MAX_IMAGE_BYTES, storeBoardImage } from "@/lib/whiteboards/images"
import { ownsWhiteboard } from "@/lib/whiteboards/data"

/**
 * POST /api/board-images?board=<board id>  (multipart: file)
 *
 * Stores an image pasted onto a whiteboard in the student's own private
 * storage folder and returns the link the board saves instead of the image.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (user.mustChangePassword) return NextResponse.json({ error: "password_change_required" }, { status: 403 })

  const boardId = request.nextUrl.searchParams.get("board") ?? ""
  if (!(await ownsWhiteboard(boardId))) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > MAX_IMAGE_BYTES + 64_000) return NextResponse.json({ error: "too_large" }, { status: 413 })

  let file: FormDataEntryValue | null
  try {
    file = (await request.formData()).get("file")
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 })
  }
  if (!(file instanceof Blob)) return NextResponse.json({ error: "no_file" }, { status: 400 })
  if (!IMAGE_TYPES[file.type]) return NextResponse.json({ error: "unsupported_type" }, { status: 415 })
  if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 })

  try {
    // Ownership is checked above and the path is built from the student's own id here, so the
    // server-only storage client can only ever write into this student's own folder.
    const path = await storeBoardImage(createAdminClient(), user.id, boardId, file, file.type)
    return NextResponse.json({ src: `${IMAGE_ROUTE}/${path}` })
  } catch (err) {
    console.error("[board-images] upload failed", err)
    return NextResponse.json({ error: "upload_failed" }, { status: 500 })
  }
}
