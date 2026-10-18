import "server-only"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"
import { reportMarkdown, type BugReport } from "./schema"

/**
 * Where bug reports go:
 * - Running locally (npm run dev): straight into the project, at
 *   bug-reports/<folder>/ - report.md, screenshot.png, tutor.json, board.json.
 * - Deployed (no writable project folder): a private Supabase Storage bucket,
 *   "bug-reports", in the same layout. `npm run bugs:pull` copies them into
 *   bug-reports/ locally.
 */

export const BUG_REPORTS_BUCKET = "bug-reports"
export const LOCAL_BUG_REPORTS_DIR = path.join(process.cwd(), "bug-reports")

export function reportFiles(report: BugReport, meta: { at: Date; reporter: string; folder: string }): { name: string; body: string | Buffer; type: string }[] {
  const files: { name: string; body: string | Buffer; type: string }[] = [
    { name: "report.md", body: reportMarkdown(report, meta), type: "text/markdown" },
  ]
  if (report.screenshot) files.push({ name: "screenshot.png", body: Buffer.from(report.screenshot, "base64"), type: "image/png" })
  if (report.context.tutor) files.push({ name: "tutor.json", body: report.context.tutor, type: "application/json" })
  if (report.context.board) files.push({ name: "board.json", body: report.context.board, type: "application/json" })
  return files
}

/** Saves into the project folder. Only used when running locally. */
export async function saveReportLocally(folder: string, files: ReturnType<typeof reportFiles>): Promise<string> {
  const dir = path.join(LOCAL_BUG_REPORTS_DIR, folder)
  await mkdir(dir, { recursive: true })
  for (const file of files) await writeFile(path.join(dir, file.name), file.body)
  return dir
}

/** Saves into the private bucket (deployed app). */
export async function saveReportToStorage(admin: SupabaseClient, folder: string, files: ReturnType<typeof reportFiles>): Promise<void> {
  for (const file of files) {
    const { error } = await admin.storage.from(BUG_REPORTS_BUCKET).upload(`${folder}/${file.name}`, file.body, { contentType: file.type, upsert: false })
    if (error) throw new Error(`bug report upload failed: ${error.message}`)
  }
}
