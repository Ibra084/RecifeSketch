import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth/session"
import { isWhiteboardId, saveWhiteboardSnapshot, SNAPSHOT_MAX_BYTES } from "@/lib/whiteboards/data"

/**
 * Autosave endpoint for a board's tldraw snapshot. A route handler rather
 * than a server action because snapshots with pasted images can exceed the
 * server-action body limit.
 */
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/whiteboards/[id]">) {
  const { id } = await ctx.params
  if (!isWhiteboardId(id)) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (user.mustChangePassword) return NextResponse.json({ error: "password_change_required" }, { status: 403 })

  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > SNAPSHOT_MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 })

  const text = await request.text()
  if (text.length > SNAPSHOT_MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 })

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const snapshot = (body as { snapshot?: unknown } | null)?.snapshot
  if (!snapshot || typeof snapshot !== "object") {
    return NextResponse.json({ error: "invalid_snapshot" }, { status: 400 })
  }

  try {
    const updatedAt = await saveWhiteboardSnapshot(id, snapshot)
    if (!updatedAt) return NextResponse.json({ error: "not_found" }, { status: 404 })
    return NextResponse.json({ updatedAt })
  } catch (err) {
    console.error("[whiteboards] save failed", err)
    return NextResponse.json({ error: "save_failed" }, { status: 500 })
  }
}
