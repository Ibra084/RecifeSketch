"use client"

import { useEffect, useRef, useState } from "react"
import { getSnapshot, type Editor } from "tldraw"
import { Bug, Check, Loader2, X } from "lucide-react"
import { cn } from "cn"
import { MAX_BOARD_JSON, MAX_SCREENSHOT_BASE64, MAX_TUTOR_JSON } from "@/lib/bug-reports/schema"
import { collectedConsole, collectedTutorExchanges, installBugCollector } from "./collector"

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return dataUrl.split(",")[1] ?? ""
}

/** A picture of what's on screen right now (the visible part of the board). */
async function captureScreen(editor: Editor): Promise<string | undefined> {
  const view = editor.getViewportPageBounds()
  const ids = editor.getCurrentPageShapes().filter((s) => editor.getShapePageBounds(s)?.collides(view)).map((s) => s.id)
  if (ids.length === 0) return undefined
  const { blob } = await editor.toImage(ids, { format: "png", background: true, bounds: view, padding: 0, pixelRatio: 1 })
  const base64 = await blobToBase64(blob)
  return base64.length <= MAX_SCREENSHOT_BASE64 ? base64 : undefined
}

/**
 * The small, faint "report a bug" button in the board's bottom-right corner.
 * It opens a short form; the report includes (if ticked) a screenshot of
 * what's on screen, plus the board's layout, recent errors and the last tutor
 * exchange - everything needed to reproduce and fix it.
 */
export function BugReporter({ editor, boardId }: { editor: Editor | null; boardId?: string }) {
  const [open, setOpen] = useState(false)
  const [description, setDescription] = useState("")
  const [includeScreenshot, setIncludeScreenshot] = useState(true)
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [error, setError] = useState("")
  const textRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => installBugCollector(), [])
  useEffect(() => {
    if (open) textRef.current?.focus()
  }, [open])

  async function send() {
    if (description.trim().length < 3 || state === "sending") return
    setState("sending")
    setError("")
    try {
      const board = editor ? JSON.stringify(getSnapshot(editor.store).document) : undefined
      const tutor = collectedTutorExchanges()
      const report = {
        description: description.trim(),
        ...(includeScreenshot && editor ? { screenshot: await captureScreen(editor).catch(() => undefined) } : {}),
        context: {
          url: window.location.pathname,
          ...(boardId ? { boardId } : {}),
          viewport: { w: window.innerWidth, h: window.innerHeight, ...(editor ? { zoom: editor.getZoomLevel() } : {}) },
          userAgent: navigator.userAgent.slice(0, 400),
          console: collectedConsole(),
          ...(tutor && tutor.length <= MAX_TUTOR_JSON ? { tutor } : {}),
          ...(board && board.length <= MAX_BOARD_JSON ? { board } : {}),
        },
      }
      const response = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error || "Couldn't send the report.")
      }
      setState("sent")
      setDescription("")
      window.setTimeout(() => {
        setOpen(false)
        setState("idle")
      }, 1600)
    } catch (err) {
      setState("error")
      setError(err instanceof Error ? err.message : "Couldn't send the report.")
    }
  }

  return (
    // Above tldraw's own UI layers (it uses z-indexes in the hundreds), tucked into the bottom-right corner.
    <div className="pointer-events-none absolute bottom-16 right-3 z-[600] flex flex-col items-end gap-2 sm:bottom-14">
      {open && (
        <div
          role="dialog"
          aria-label="Report a bug"
          className="pointer-events-auto w-[min(320px,calc(100vw-24px))] rounded-2xl border border-border-subtle bg-surface p-3 animate-popover-in"
          style={{ boxShadow: "var(--shadow-popover)", transformOrigin: "bottom right" }}
          // Typing here must never trigger whiteboard shortcuts.
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Escape") setOpen(false)
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">Report a bug</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {state === "sent" ? (
            <p role="status" className="flex items-center gap-2 py-3 text-[13px] text-green-700">
              <Check className="h-4 w-4" /> Thanks - it&apos;s been sent.
            </p>
          ) : (
            <>
              <textarea
                ref={textRef}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send()
                }}
                rows={4}
                maxLength={2000}
                placeholder="What went wrong? e.g. “The arrows weren't on the masses”"
                aria-label="What went wrong"
                className="block w-full resize-none rounded-xl border border-border-subtle bg-surface-subtle px-3 py-2 text-base text-ink outline-none placeholder:text-ink-muted focus-visible:border-accent md:text-[13px]"
              />
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-ink-secondary">
                <input type="checkbox" checked={includeScreenshot} onChange={(e) => setIncludeScreenshot(e.target.checked)} className="accent-blue-600" />
                Include a picture of what&apos;s on screen
              </label>
              {state === "error" && <p role="alert" className="mt-2 text-[12px] text-red-600">{error}</p>}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-ink-muted">Also sends recent errors and the last tutor answer.</span>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={description.trim().length < 3 || state === "sending"}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-40"
                >
                  {state === "sending" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {state === "sending" ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Report a bug"
        title="Report a bug"
        aria-expanded={open}
        className={cn(
          "pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle bg-surface text-ink-muted transition-opacity duration-150 hover:opacity-100 focus-visible:opacity-100 pointer-coarse:h-11 pointer-coarse:w-11",
          open ? "opacity-100" : "opacity-35"
        )}
      >
        <Bug className="h-3.5 w-3.5" strokeWidth={1.75} />
      </button>
    </div>
  )
}
