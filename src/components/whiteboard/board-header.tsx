"use client"

import Link from "next/link"
import { AlertCircle, ChevronLeft, Cloud, Loader2 } from "lucide-react"
import { RecifeWordmark } from "@/components/brand/recife-wordmark"
import type { SaveStatus } from "./board-persistence"

const STATUS: Record<SaveStatus, { label: string; className: string }> = {
  saved: { label: "Saved", className: "text-ink-muted" },
  saving: { label: "Saving…", className: "text-ink-muted" },
  unsaved: { label: "Unsaved changes", className: "text-ink-muted" },
  error: { label: "Not saved, retrying", className: "text-amber-600" },
}

/** Whiteboard top bar for a saved board: back to dashboard, title, autosave state. */
export function BoardHeader({ title, status }: { title: string; status: SaveStatus }) {
  const { label, className } = STATUS[status]
  const Icon = status === "saving" ? Loader2 : status === "error" ? AlertCircle : Cloud

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
      <h1 className="min-w-0 truncate px-1 text-[14px] font-semibold text-ink">{title}</h1>
      <span role="status" className={`ml-1 hidden items-center gap-1 text-[12px] sm:flex ${className}`}>
        <Icon className={`h-3.5 w-3.5 ${status === "saving" ? "animate-spin" : ""}`} strokeWidth={1.75} aria-hidden />
        {label}
      </span>
      <RecifeWordmark href="/dashboard" className="ml-auto pr-1" />
    </header>
  )
}
