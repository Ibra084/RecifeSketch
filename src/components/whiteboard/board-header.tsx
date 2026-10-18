"use client"

import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from "react"
import Link from "next/link"
import { AlertCircle, ChevronLeft, Cloud, Loader2, PanelRightClose, PanelRightOpen, Pencil } from "lucide-react"
import { RecifeWordmark } from "@/components/brand/recife-wordmark"
import { renameWhiteboardAction } from "@/app/dashboard/actions"
import type { SaveStatus } from "./board-persistence"

const STATUS: Record<SaveStatus, { label: string; className: string }> = {
  saved: { label: "Saved", className: "text-ink-muted" },
  saving: { label: "Saving…", className: "text-ink-muted" },
  unsaved: { label: "Unsaved changes", className: "text-ink-muted" },
  error: { label: "Not saved, retrying", className: "text-amber-600" },
}

const TITLE_MAX = 80

/** The board's name: click to rename, Enter or clicking away saves, Escape cancels. */
function BoardTitle({ boardId, title, editOnOpen }: { boardId: string; title: string; editOnOpen: boolean }) {
  const [shown, setShown] = useState(title)
  const [draft, setDraft] = useState(title)
  const [editing, setEditing] = useState(editOnOpen)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function save() {
    const next = draft.replace(/\s+/g, " ").trim()
    setEditing(false)
    if (!next || next === shown) {
      setDraft(shown)
      return
    }
    const previous = shown
    setShown(next) // show the new name straight away
    setError(null)
    startTransition(async () => {
      const { ok } = await renameWhiteboardAction(boardId, next).catch(() => ({ ok: false }))
      if (!ok) {
        setShown(previous)
        setDraft(previous)
        setError("Couldn't rename. Try again.")
      }
    })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    event.stopPropagation() // typing here must never trigger whiteboard shortcuts
    if (event.key === "Enter") save()
    if (event.key === "Escape") {
      setDraft(shown)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={TITLE_MAX}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={save}
        aria-label="Whiteboard name"
        placeholder="Name this whiteboard"
        className="h-8 w-[min(320px,45vw)] min-w-0 rounded-lg border border-blue-500 bg-surface px-2 text-[14px] font-semibold text-ink outline-none ring-4 ring-blue-500/15"
      />
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => { setDraft(shown); setEditing(true) }}
        title="Rename this whiteboard"
        aria-label={`Rename whiteboard: ${shown}`}
        className="group flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2 text-left transition-colors duration-150 hover:bg-surface-sunken"
      >
        <h1 className="min-w-0 truncate text-[14px] font-semibold text-ink">{shown}</h1>
        <Pencil className="h-3.5 w-3.5 shrink-0 text-ink-faint transition-colors group-hover:text-ink-muted" strokeWidth={1.75} aria-hidden />
      </button>
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" aria-label="Saving name" />}
      {error && <span role="alert" className="text-[12px] text-red-600">{error}</span>}
    </div>
  )
}

interface BoardHeaderProps {
  boardId: string
  title: string
  status: SaveStatus
  /** A brand-new board opens with its name ready to type. */
  editTitleOnOpen: boolean
  stylePanelHidden: boolean
  onToggleStylePanel: () => void
}

/** Whiteboard top bar for a saved board: back to dashboard, editable name, autosave state, panel toggle. */
export function BoardHeader({ boardId, title, status, editTitleOnOpen, stylePanelHidden, onToggleStylePanel }: BoardHeaderProps) {
  const { label, className } = STATUS[status]
  const Icon = status === "saving" ? Loader2 : status === "error" ? AlertCircle : Cloud
  const ToggleIcon = stylePanelHidden ? PanelRightOpen : PanelRightClose
  const toggleLabel = stylePanelHidden ? "Show style panel" : "Hide style panel"

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface px-2 sm:px-3">
      <Link
        href="/dashboard"
        aria-label="Back to your whiteboards"
        className="flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:bg-surface-sunken hover:text-ink"
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        <span className="hidden sm:inline">Whiteboards</span>
      </Link>
      <span aria-hidden className="h-5 w-px bg-border-subtle" />
      <BoardTitle boardId={boardId} title={title} editOnOpen={editTitleOnOpen} />
      <span role="status" className={`ml-1 hidden items-center gap-1 text-[12px] sm:flex ${className}`}>
        <Icon className={`h-3.5 w-3.5 ${status === "saving" ? "animate-spin" : ""}`} strokeWidth={1.75} aria-hidden />
        {label}
      </span>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleStylePanel}
          aria-pressed={stylePanelHidden}
          title={toggleLabel}
          className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:bg-surface-sunken hover:text-ink"
        >
          <ToggleIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <span className="hidden md:inline">{stylePanelHidden ? "Show styles" : "Hide styles"}</span>
          <span className="sr-only md:hidden">{toggleLabel}</span>
        </button>
        <RecifeWordmark href="/dashboard" className="pr-1" />
      </div>
    </header>
  )
}
