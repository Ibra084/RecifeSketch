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

/** The dashboard's Mistake Memory: misconceptions the student chose to save, each with a Practice button. */
export function MistakeMemory({ mistakes }: { mistakes: MistakeRecord[] }) {
  return (
    <section aria-labelledby="mistakes-heading" className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="mistakes-heading" className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-400">
          <Brain className="h-3.5 w-3.5" aria-hidden />
          Mistake Memory
        </h2>
        {mistakes.length > 0 && <span className="text-xs text-gray-400">{mistakes.length}</span>}
      </div>

      {mistakes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-6 text-center">
          <p className="text-[14px] font-medium text-gray-700">No saved mistakes yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-gray-400">
            On a whiteboard, select your working and choose &ldquo;Check my work&rdquo; in the orb. If Recife finds a mistake,
            you can save it here and practise it later.
          </p>
        </div>
      ) : (
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
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", status.className)}>
                    {status.label}
                    {m.practiceAttempts > 0 ? ` · ${m.practiceAttempts} ${m.practiceAttempts === 1 ? "try" : "tries"}` : ""}
                  </span>
                  <form action={practiceMistakeAction}>
                    <input type="hidden" name="mistakeId" value={m.id} />
                    <PracticeButton />
                  </form>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
