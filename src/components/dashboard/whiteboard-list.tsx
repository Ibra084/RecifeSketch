"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { Check, Pencil, PenLine, Trash2, X } from "lucide-react"
import { cn } from "cn"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { deleteWhiteboardAction, renameWhiteboardAction } from "@/app/dashboard/actions"
import type { WhiteboardSummary } from "@/lib/whiteboards/data"
import { RelativeTime } from "./relative-time"

const ICON_BUTTON =
  "tap-target flex items-center justify-center rounded-lg text-gray-400 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-700 sm:min-h-8 sm:min-w-8 sm:h-8 sm:w-8"

function WhiteboardRow({ board, onDelete }: { board: WhiteboardSummary; onDelete: (b: WhiteboardSummary) => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(board.title)
  const [shownTitle, setShownTitle] = useState(board.title)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function save() {
    const next = title.trim()
    if (!next || next === shownTitle) {
      setEditing(false)
      setTitle(shownTitle)
      return
    }
    setError(null)
    startTransition(async () => {
      const { ok } = await renameWhiteboardAction(board.id, next)
      if (ok) {
        setShownTitle(next)
        setEditing(false)
      } else {
        setError("Couldn't rename this whiteboard. Try again.")
      }
    })
  }

  return (
    <li className="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-gray-50/70">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
        <PenLine className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>

      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <input
            ref={inputRef}
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false)
                setTitle(shownTitle)
              }
            }}
            aria-label="Whiteboard name"
            disabled={pending}
            className="min-w-0 flex-1 rounded-xl border border-blue-500 bg-white px-3 py-1.5 text-[15px] text-gray-900 outline-none ring-4 ring-blue-500/15"
          />
          <button type="submit" aria-label="Save name" disabled={pending} className={cn(ICON_BUTTON, "text-blue-600")}>
            <Check className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label="Cancel rename"
            onClick={() => {
              setEditing(false)
              setTitle(shownTitle)
            }}
            className={ICON_BUTTON}
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </form>
      ) : (
        <Link href={`/board/${board.id}`} prefetch={false} className="min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40">
          <span className="block truncate text-[15px] font-medium text-gray-900">{shownTitle}</span>
          <span className="block text-[12.5px] text-gray-400">
            <RelativeTime iso={board.updatedAt} prefix="Edited " />
          </span>
        </Link>
      )}

      {!editing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <button type="button" aria-label={`Rename ${shownTitle}`} onClick={() => setEditing(true)} className={ICON_BUTTON}>
            <Pencil className="h-4 w-4" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label={`Delete ${shownTitle}`}
            onClick={() => onDelete({ ...board, title: shownTitle })}
            className={cn(ICON_BUTTON, "hover:bg-red-50 hover:text-red-600")}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      )}
      {error && <p role="alert" className="shrink-0 text-xs text-red-600">{error}</p>}
    </li>
  )
}

export function WhiteboardList({ boards }: { boards: WhiteboardSummary[] }) {
  // Hide deleted rows immediately; the revalidated server list catches up.
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(new Set())
  const items = boards.filter((b) => !deletedIds.has(b.id))
  const [toDelete, setToDelete] = useState<WhiteboardSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirmDelete() {
    if (!toDelete) return
    const target = toDelete
    setError(null)
    startTransition(async () => {
      const { ok } = await deleteWhiteboardAction(target.id)
      if (ok) setDeletedIds((prev) => new Set(prev).add(target.id))
      else setError("Couldn't delete that whiteboard. Try again.")
      setToDelete(null)
    })
  }

  return (
    <>
      {error && (
        <div role="alert" className="mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white">
        {items.map((board) => (
          <WhiteboardRow key={board.id} board={board} onDelete={setToDelete} />
        ))}
      </ul>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && !pending && setToDelete(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-semibold text-gray-900">Delete this whiteboard?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{toDelete?.title}&rdquo; and everything drawn on it will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="rounded-b-2xl">
            <AlertDialogCancel disabled={pending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
