import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/server"
import { BOARD_IMAGES_BUCKET, IMAGE_TYPES, isImagePath } from "@/lib/whiteboards/images"

const MIME_BY_EXT = Object.fromEntries(Object.entries(IMAGE_TYPES).map(([mime, ext]) => [ext, mime]))

/**
 * GET /api/board-images/<user id>/<board id>/<file>
 *
 * Serves a stored whiteboard image back to the student who owns it. Anyone
 * else - including other students - gets a 404: the path must be a stored
 * image path inside the signed-in student's own folder. Images never change
 * once stored, so the browser may keep them, privately, for a long time.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/board-images/[...path]">) {
  const { path: segments } = await ctx.params
  const path = segments.join("/")
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (!isImagePath(path) || segments[0] !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 })

  // Only ever a path inside this student's own folder (checked above).
  const { data, error } = await createAdminClient().storage.from(BOARD_IMAGES_BUCKET).download(path)
  if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase()
  return new NextResponse(data, {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
