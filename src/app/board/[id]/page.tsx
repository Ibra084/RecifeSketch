import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { getWhiteboard } from "@/lib/whiteboards/data"
import { practiceForBoard } from "@/lib/mistakes/data"

export const metadata: Metadata = { title: "Whiteboard · Recife Sketch" }

async function Board({ params }: { params: PageProps<"/board/[id]">["params"] }) {
  const { id } = await params
  // getWhiteboard verifies the session and only returns the student's own board.
  const board = await getWhiteboard(id)
  if (!board) notFound()
  // A Mistake Memory practice board shows its question (only the prompt - never the answer).
  const practice = await practiceForBoard(board.id).catch(() => null)
  return (
    <AppShell
      key={board.id}
      board={{ id: board.id, title: board.title, snapshot: board.snapshot, updatedAt: board.updatedAt }}
      {...(practice ? { practice: { prompt: practice.question.prompt } } : {})}
    />
  )
}

export default function BoardPage({ params }: PageProps<"/board/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-surface-subtle text-[13px] text-ink-muted">
          Opening whiteboard…
        </div>
      }
    >
      <Board params={params} />
    </Suspense>
  )
}
