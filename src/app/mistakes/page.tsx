import { Suspense } from "react"
import type { Metadata } from "next"
import { AppHeader } from "@/components/dashboard/app-header"
import { MistakesOverview } from "@/components/dashboard/mistake-memory"
import { requireUser } from "@/lib/auth/session"
import { listMistakes } from "@/lib/mistakes/data"

export const metadata: Metadata = { title: "Your mistakes · Recife Sketch" }

async function MistakesContent() {
  await requireUser()
  const mistakes = await listMistakes()
  if (!mistakes) {
    return <p className="rounded-2xl border border-gray-100 bg-white px-5 py-6 text-sm text-gray-500">Mistake Memory isn&apos;t set up on this server yet.</p>
  }
  return <MistakesOverview mistakes={mistakes} />
}

/** The Mistakes tab: everything the student has saved from "Check my work", and how their practice is going. */
export default function MistakesPage() {
  return (
    <div className="min-h-dvh bg-gray-50">
      <AppHeader active="mistakes" />
      <main className="animate-page-in mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">Your mistakes</h1>
        <p className="mb-6 mt-0.5 text-sm text-gray-400">
          The mistakes you&apos;ve saved, and how your practice on each one is going. Practise one to make sure it sticks.
        </p>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-white" />}>
          <MistakesContent />
        </Suspense>
      </main>
    </div>
  )
}
