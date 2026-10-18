import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { createRateLimiter } from "@/lib/ai/rate-limiter"
import { getCurrentUser } from "@/lib/auth/session"
import { bugReportSchema, reportFolderName } from "@/lib/bug-reports/schema"
import { reportFiles, saveReportLocally, saveReportToStorage } from "@/lib/bug-reports/store"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * POST /api/bug-reports
 *
 * Saves a bug report from the board's report button: into the project's
 * bug-reports/ folder when running locally, or a private storage bucket when
 * deployed. Signed-in users only; a few reports per user per few minutes.
 */

const MAX_BODY_BYTES = 6_500_000
// About 5 reports in a burst, then one every 2 minutes.
const limiter = createRateLimiter({ capacity: 5, refillPerSec: 1 / 120 })

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
  if (!limiter.tryConsume(user.id)) return NextResponse.json({ error: "Too many reports - please wait a couple of minutes." }, { status: 429 })

  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "Report too large." }, { status: 413 })
  let json: unknown
  try { json = JSON.parse(text) } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }
  const parsed = bugReportSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid report" }, { status: 400 })
  }

  const at = new Date()
  const folder = reportFolderName(parsed.data.description, at, randomUUID())
  // Who sent it, without personal data in the report itself: account type and id only.
  const reporter = `${user.accountType}${user.isAdmin ? " (admin)" : ""} ${user.id}`
  const files = reportFiles(parsed.data, { at, reporter, folder })

  try {
    if (process.env.NODE_ENV === "development") {
      const dir = await saveReportLocally(folder, files)
      console.info(`[bug-report] saved to ${dir}`)
    } else {
      await saveReportToStorage(createAdminClient(), folder, files)
      console.info(`[bug-report] saved to storage: bug-reports/${folder}`)
    }
  } catch (err) {
    console.error("[bug-report] could not save", err)
    return NextResponse.json({ error: "Couldn't save the report. Please try again." }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: folder })
}
