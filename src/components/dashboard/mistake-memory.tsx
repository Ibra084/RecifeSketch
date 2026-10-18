"use client"

import { useFormStatus } from "react-dom"
import { Brain, Loader2, PenLine, X } from "lucide-react"
import { cn } from "cn"
import { deleteMistakeAction, practiceMistakeAction } from "@/app/mistakes/actions"
import type { MistakeRecord, PracticeStatus } from "@/lib/mistakes/schema"
import { RelativeTime } from "./relative-time"

const STATUS: Record<PracticeStatus, { label: string; className: string }> = {
  not_practised: { label: "Not practised yet", className: "bg-gray-100 text-gray-600" },
  needs_practice: { label: "Keep practising", className: "bg-amber-50 text-amber-700" },
  practised: { label: "Practised", className: "bg-green-50 text-green-700" },
}

function PracticeButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-press flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-70 pointer-coarse:h-11"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <PenLine className="h-3.5 w-3.5" aria-hidden />}
      {pending ? "Setting up…" : "Practice"}
    </button>
  )
}

function RemoveButton({ concept }: { concept: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Remove ${concept} from Mistake Memory`}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-50 pointer-coarse:h-11 pointer-coarse:w-11"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
    </button>
  )
}

const SKILL_NAMES: Record<MistakeRecord["skill"], string> = {
  expand_brackets: "Expanding brackets",
  simplify_expression: "Simplifying expressions",
  solve_linear_equation: "Linear equations",
}

/**
 * The Mistakes tab: an overview of every mistake the student saved - how many
 * still need practice, grouped by topic - each with a Practice button.
 */
export function MistakesOverview({ mistakes }: { mistakes: MistakeRecord[] }) {
  if (mistakes.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center">
        <Brain className="mx-auto mb-2 h-6 w-6 text-gray-300" aria-hidden />
        <p className="text-[15px] font-medium text-gray-700">No saved mistakes yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-gray-400">
          On a whiteboard, select your working and choose &ldquo;Check my work&rdquo; in the orb. If Recife finds a mistake,
          you can save it here and practise it until it sticks.
        </p>
      </div>
    )
  }
  const counts = {
    toPractise: mistakes.filter((m) => m.practiceStatus !== "practised").length,
    practised: mistakes.filter((m) => m.practiceStatus === "practised").length,
    tries: mistakes.reduce((n, m) => n + m.practiceAttempts, 0),
  }
  // Grouped by skill, topics with the most still-to-practise first.
  const groups = [...new Set(mistakes.map((m) => m.skill))]
    .map((skill) => ({ skill, items: mistakes.filter((m) => m.skill === skill) }))
    .sort((a, b) => b.items.filter((m) => m.practiceStatus !== "practised").length - a.items.filter((m) => m.practiceStatus !== "practised").length)

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: "To practise", value: counts.toPractise, tone: "text-amber-700" },
          { label: "Practised", value: counts.practised, tone: "text-green-700" },
          { label: "Practice tries", value: counts.tries, tone: "text-gray-900" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-gray-100 bg-white px-4 py-3" style={{ boxShadow: "var(--shadow-soft)" }}>
            <dt className="text-[12px] text-gray-400">{stat.label}</dt>
            <dd className={cn("text-2xl font-bold tracking-tight", stat.tone)}>{stat.value}</dd>
          </div>
        ))}
      </dl>
      {groups.map((group) => (
        <section key={group.skill} aria-labelledby={`skill-${group.skill}`}>
          <h2 id={`skill-${group.skill}`} className="mb-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-400">
            {SKILL_NAMES[group.skill]} <span className="ml-1 font-normal normal-case tracking-normal">{group.items.length}</span>
          </h2>
          <MistakeList mistakes={group.items} />
        </section>
      ))}
    </div>
  )
}

function MistakeList({ mistakes }: { mistakes: MistakeRecord[] }) {
  return (
        <ul className="grid gap-3 sm:grid-cols-2">
          {mistakes.map((m) => {
            const status = STATUS[m.practiceStatus]
            return (
              <li key={m.id} className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4" style={{ boxShadow: "var(--shadow-soft)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-gray-900">{m.concept}</p>
                    <p className="text-[12px] text-gray-400">
                      <RelativeTime iso={m.createdAt} prefix="Saved " />
                    </p>
                  </div>
                  <form action={deleteMistakeAction}>
                    <input type="hidden" name="mistakeId" value={m.id} />
                    <RemoveButton concept={m.concept} />
                  </form>
                </div>
                <p className="mt-2 text-[13px] leading-snug text-gray-600">{m.misconception}</p>
                <p className="mt-2 truncate rounded-lg bg-gray-50 px-2.5 py-1.5 font-mono text-[12.5px] text-gray-500" title="What you wrote">
                  {m.incorrectStep}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", status.className)}>
                      {status.label}
                      {m.practiceAttempts > 0 ? ` · ${m.practiceAttempts} ${m.practiceAttempts === 1 ? "try" : "tries"}` : ""}
                    </span>
                    {m.lastPractisedAt && (
                      <p className="mt-1 px-0.5 text-[11.5px] text-gray-400">
                        <RelativeTime iso={m.lastPractisedAt} prefix="Last practised " />
                      </p>
                    )}
                  </div>
                  <form action={practiceMistakeAction}>
                    <input type="hidden" name="mistakeId" value={m.id} />
                    <PracticeButton />
                  </form>
                </div>
              </li>
            )
          })}
        </ul>
  )
}

/** The dashboard's one-line pointer to the Mistakes tab. */
export function MistakesLink({ mistakes }: { mistakes: MistakeRecord[] }) {
  const toPractise = mistakes.filter((m) => m.practiceStatus !== "practised").length
  return (
    <a
      href="/mistakes"
      className="card-hover mt-4 flex items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3"
      style={{ boxShadow: "var(--shadow-soft)" }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
        <Brain className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-gray-900">Your mistakes</span>
        <span className="block text-[12.5px] text-gray-400">
          {mistakes.length === 0
            ? "Mistakes you save from “Check my work” appear here"
            : `${mistakes.length} saved · ${toPractise ? `${toPractise} to practise` : "all practised"}`}
        </span>
      </span>
    </a>
  )
}
