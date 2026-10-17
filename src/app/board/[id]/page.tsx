import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AppShell } from "@/components/app-shell"
import { getWhiteboard } from "@/lib/whiteboards/data"

export const metadata: Metadata = { title: "Whiteboard · Recife Sketch" }

async function Board({ params }: { params: PageProps<"/board/[id]">["params"] }) {
  const { id } = await params
  // getWhiteboard verifies the session and only returns the student's own board.
  const board = await getWhiteboard(id)
  if (!board) notFound()
  return (
    <AppShell
      key={board.id}
      board={{ id: board.id, title: board.title, snapshot: board.snapshot, updatedAt: board.updatedAt }}
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
