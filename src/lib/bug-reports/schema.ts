import { z } from "zod"

/**
 * What a bug report carries. Everything is optional except the description,
 * and everything is capped, so a report can't be used to push huge payloads.
 * The tutor exchange and board snapshot are what make AI placement bugs
 * reproducible: they show exactly what was asked, what the model returned,
 * and where things ended up on the board.
 */

export const MAX_SCREENSHOT_BASE64 = 4_000_000 // ~3 MB PNG
export const MAX_BOARD_JSON = 1_500_000
export const MAX_TUTOR_JSON = 400_000

const jsonText = (max: number) => z.string().max(max)

export const bugReportSchema = z.strictObject({
  description: z.string().trim().min(3, "Say what went wrong").max(2000),
  /** PNG of what was on screen, base64 without the data: prefix. */
  screenshot: z.string().max(MAX_SCREENSHOT_BASE64).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional(),
  context: z.strictObject({
    url: z.string().max(500),
    boardId: z.string().max(64).optional(),
    viewport: z.strictObject({ w: z.number(), h: z.number(), zoom: z.number().optional() }).optional(),
    userAgent: z.string().max(400).optional(),
    /** Recent console warnings/errors and uncaught errors, newest last. */
    console: z.array(z.strictObject({ level: z.string().max(10), message: z.string().max(2000), at: z.string().max(40) })).max(50).optional(),
    /** The last tutor request/response(s), as JSON text (image data stripped). */
    tutor: jsonText(MAX_TUTOR_JSON).optional(),
    /** The board's tldraw document, as JSON text (images are links, so it stays small). */
    board: jsonText(MAX_BOARD_JSON).optional(),
  }),
})

export type BugReport = z.infer<typeof bugReportSchema>

/** A short, filesystem-safe name for the report folder. */
export function reportFolderName(description: string, at: Date, id: string): string {
  const stamp = at.toISOString().replace(/[:T]/g, "-").replace(/\..+$/, "")
  const slug = description.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "report"
  return `${stamp}-${slug}-${id.slice(0, 6)}`
}

/** The human-readable report file - the first thing to read when fixing it. */
export function reportMarkdown(report: BugReport, meta: { at: Date; reporter: string; folder: string }): string {
  const c = report.context
  return [
    `# Bug report: ${report.description.split("\n")[0].slice(0, 100)}`,
    "",
    `- **When:** ${meta.at.toISOString()}`,
    `- **Reporter:** ${meta.reporter}`,
    `- **Page:** ${c.url}`,
    ...(c.boardId ? [`- **Board:** ${c.boardId}`] : []),
    ...(c.viewport ? [`- **Viewport:** ${Math.round(c.viewport.w)}x${Math.round(c.viewport.h)}${c.viewport.zoom ? ` at ${Math.round(c.viewport.zoom * 100)}% zoom` : ""}`] : []),
    ...(c.userAgent ? [`- **Browser:** ${c.userAgent}`] : []),
    "",
    "## What went wrong",
    "",
    report.description,
    "",
    "## Attached",
    "",
    report.screenshot ? "- `screenshot.png` - what was on screen when it was reported" : "- (no screenshot)",
    c.tutor ? "- `tutor.json` - the last tutor request(s) and answer(s), image data stripped" : "- (no tutor exchange this session)",
    c.board ? "- `board.json` - the board's tldraw document" : "- (no board snapshot)",
    c.console?.length ? `- ${c.console.length} recent console warnings/errors below` : "- (no console warnings/errors)",
    "",
    ...(c.console?.length ? ["## Console", "", "```", ...c.console.map((e) => `[${e.at}] ${e.level}: ${e.message}`), "```", ""] : []),
    "## Status",
    "",
    "- [ ] Reproduced",
    "- [ ] Fixed",
    "",
  ].join("\n")
}
