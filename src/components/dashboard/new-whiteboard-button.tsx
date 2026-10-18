"use client"

import { useRef, type CSSProperties, type ReactNode } from "react"
import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"
import { createWhiteboardAction } from "@/app/dashboard/actions"

function SubmitButton({ className, style, children, pendingLabel }: { className: string; style?: CSSProperties; children: ReactNode; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className} style={style}>
      {pending ? (
        <span className="flex w-full items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  )
}

/**
 * "Start a new whiteboard". Shows that it's working the moment it's pressed
 * and ignores further presses, and the new board's id is chosen once per
 * page - so even a submit that slips through opens the same board instead of
 * creating extra ones.
 */
export function NewWhiteboardButton(props: { className: string; style?: CSSProperties; children: ReactNode; pendingLabel?: string }) {
  const boardId = useRef<string | null>(null)
  return (
    <form
      action={(formData) => {
        boardId.current ??= crypto.randomUUID()
        formData.set("boardId", boardId.current)
        return createWhiteboardAction(formData)
      }}
    >
      <SubmitButton className={props.className} style={props.style} pendingLabel={props.pendingLabel ?? "Creating…"}>
        {props.children}
      </SubmitButton>
    </form>
  )
}
