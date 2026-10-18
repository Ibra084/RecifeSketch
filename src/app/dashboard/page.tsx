import { Suspense } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, PenLine, Plus } from "lucide-react"
import { AppHeader } from "@/components/dashboard/app-header"
import { RelativeTime } from "@/components/dashboard/relative-time"
import { WhiteboardList } from "@/components/dashboard/whiteboard-list"
import { NoticeBanner } from "@/components/auth/fields"
import { requireUser } from "@/lib/auth/session"
import { listWhiteboards, type WhiteboardSummary } from "@/lib/whiteboards/data"
import { NewWhiteboardButton } from "@/components/dashboard/new-whiteboard-button"
import { MistakeMemory } from "@/components/dashboard/mistake-memory"
import { listMistakes } from "@/lib/mistakes/data"

export const metadata: Metadata = { title: "Your whiteboards · Recife Sketch" }

const NOTICES: Record<string, string> = {
  welcome: "You're all set. Your new password is saved.",
  "password-updated": "Your password has been updated.",
  "practice-failed": "Practice couldn't be started just then. Please try again.",
}

function NewWhiteboardCard() {
  return (
    <NewWhiteboardButton
      className="card-hover btn-press group flex min-h-[88px] w-full items-center gap-4 rounded-2xl border border-gray-100 bg-white p-5 text-left text-[15px] font-semibold text-gray-500 disabled:cursor-wait"
      style={{ boxShadow: "var(--shadow-soft)" }}
      pendingLabel="Creating your whiteboard…"
    >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.6)] transition-transform duration-150 group-hover:scale-105">
          <Plus className="h-5 w-5" strokeWidth={2.25} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold text-gray-900">Start a new whiteboard</span>
          <span className="block text-sm text-gray-400">Draw a problem, or ask Recife to explain a topic.</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-gray-300 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-blue-600" aria-hidden />
    </NewWhiteboardButton>
  )
}

function RecentCard({ board }: { board: WhiteboardSummary }) {
  return (
    <Link
      href={`/board/${board.id}`}
      // Never prefetch a board: the payload is the whole drawing, and a prefetched copy can be stale.
      prefetch={false}
      className="card-hover group flex flex-col rounded-2xl border border-gray-100 bg-white p-4 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
    >
      {/* A dotted "board" thumbnail; boards themselves aren't rendered here. */}
      <span
        aria-hidden
        className="mb-3 flex h-20 items-center justify-center rounded-xl bg-gray-50 text-gray-300 transition-colors duration-150 group-hover:text-blue-500"
        style={{
          backgroundImage: "radial-gradient(rgba(24,24,27,0.08) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      >
        <PenLine className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <span className="truncate text-[15px] font-medium text-gray-900">{board.title}</span>
      <span className="text-[12.5px] text-gray-400">
        <RelativeTime iso={board.updatedAt} prefix="Edited " />
      </span>
    </Link>
  )
}

async function DashboardContent({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const [user, boards, params, mistakes] = await Promise.all([requireUser(), listWhiteboards(), searchParams, listMistakes()])
  const notice = NOTICES[String(params.notice ?? "")]
  const recent = boards.slice(0, 3)

  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">Your whiteboards</h1>
        <p className="mt-0.5 text-sm text-gray-400">
          {user.accountType === "alias" ? (
            <>Signed in as <span className="font-medium text-gray-600">{user.alias}</span></>
          ) : (
            "Pick up where you left off, or start something new."
          )}
        </p>
      </div>

      {notice && (
        <div className="mb-5">
          <NoticeBanner>{notice}</NoticeBanner>
        </div>
      )}

      <NewWhiteboardCard />

      {/* Hidden until the Mistake Memory table exists (listMistakes returns null before the migration). */}
      {mistakes && <MistakeMemory mistakes={mistakes} />}

      {boards.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-gray-700">No whiteboards yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-400">
            Your whiteboards save automatically as you work. They&apos;ll show up here.
          </p>
        </div>
      ) : (
        <>
          <section aria-labelledby="recent-heading" className="mt-8">
            <h2 id="recent-heading" className="mb-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-400">
              Recent
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {recent.map((board) => (
                <RecentCard key={board.id} board={board} />
              ))}
            </div>
          </section>

          <section aria-labelledby="saved-heading" className="mt-8">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="saved-heading" className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-400">
                Saved whiteboards
              </h2>
              <span className="text-xs text-gray-400">{boards.length}</span>
            </div>
            <WhiteboardList boards={boards} />
          </section>
        </>
      )}
    </>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-hidden className="animate-pulse">
      <div className="mb-2 h-7 w-52 rounded-lg bg-gray-200/70" />
      <div className="mb-6 h-4 w-72 rounded bg-gray-100" />
      <div className="h-[88px] rounded-2xl bg-white" />
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[146px] rounded-2xl bg-white" />
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  return (
    <div className="min-h-dvh bg-gray-50">
      <AppHeader active="dashboard" />
      <main className="animate-page-in mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardContent searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  )
}
