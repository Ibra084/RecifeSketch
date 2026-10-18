"use client"

import { useState, useTransition } from "react"
import { Check, Copy, Download, Printer, Users, X } from "lucide-react"
import { cn } from "cn"
import { createAliasesAction, type BulkAliasActionResult } from "@/app/admin/actions"
import type { BulkAliasResult } from "@/lib/auth/alias-admin"

type Created = Extract<BulkAliasResult, { password: string }>

const INPUT = "rounded-xl border border-black/[0.08] bg-white/50 px-3 py-2 text-[14px] text-gray-900 placeholder-gray-400 transition-all duration-150 focus:border-blue-500 focus:bg-white/80 focus:outline-none focus:ring-4 focus:ring-blue-500/15"

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

function downloadCsv(created: Created[]) {
  const csv = ["alias,temporary_password", ...created.map((r) => `${r.alias},${r.password}`)].join("\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = `student-aliases-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** One cut-out slip per student: where to sign in, their alias and temporary password. */
function printSlips(created: Created[]) {
  const signInUrl = `${window.location.origin}/alias`
  const slips = created.map((r) => `
    <div class="slip">
      <div class="brand">Recife Sketch</div>
      <div class="row"><span>Sign in at</span><b>${escapeHtml(signInUrl)}</b></div>
      <div class="row"><span>Student alias</span><b class="mono">${escapeHtml(r.alias)}</b></div>
      <div class="row"><span>Temporary password</span><b class="mono">${escapeHtml(r.password)}</b></div>
      <div class="note">Choose &ldquo;Sign in with a student alias&rdquo;. You'll pick your own password the first time you sign in.</div>
    </div>`).join("")
  const win = window.open("", "_blank", "width=800,height=900")
  if (!win) return
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Student alias slips</title><style>
    body { font-family: Inter, system-ui, sans-serif; margin: 16px; color: #18181b; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
    .slip { border: 1px dashed #a1a1aa; padding: 14px 16px; break-inside: avoid; }
    .brand { font-weight: 700; font-size: 14px; color: #2563eb; margin-bottom: 8px; }
    .row { display: flex; justify-content: space-between; gap: 12px; font-size: 12.5px; padding: 2px 0; }
    .row span { color: #71717a; } .mono { font-family: ui-monospace, monospace; font-size: 14px; }
    .note { margin-top: 8px; font-size: 11px; color: #71717a; }
  </style></head><body><div class="grid">${slips}</div><script>window.onload = () => window.print()</script></body></html>`)
  win.document.close()
}

/**
 * Creates a whole class's alias accounts at once - a numbered series
 * (maths7b-01 … maths7b-30) or a pasted list - then shows every temporary
 * password once, ready to copy, download as CSV, or print as slips.
 */
export function BulkAliasCreator() {
  const [mode, setMode] = useState<"series" | "list">("series")
  const [prefix, setPrefix] = useState("")
  const [count, setCount] = useState(30)
  const [start, setStart] = useState(1)
  const [list, setList] = useState("")
  const [outcome, setOutcome] = useState<BulkAliasActionResult | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  const width = Math.max(2, String(start + count - 1).length)
  const preview = prefix.trim() && count > 0
    ? `${prefix.trim().toLowerCase()}-${String(start).padStart(width, "0")} … ${prefix.trim().toLowerCase()}-${String(start + count - 1).padStart(width, "0")}`
    : null

  function create() {
    setCopied(false)
    startTransition(async () => {
      setOutcome(await createAliasesAction(mode === "series" ? { mode, prefix, count, start } : { mode, text: list }))
    })
  }

  const created = outcome?.ok ? outcome.results.filter((r): r is Created => "password" in r) : []
  const skipped = outcome?.ok ? outcome.results.filter((r): r is Extract<BulkAliasResult, { error: string }> => "error" in r) : []

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(created.map((r) => `${r.alias}\t${r.password}`).join("\n"))
      setCopied(true)
    } catch {
      // Clipboard blocked: the table is still there to copy by hand.
    }
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-[16px] font-semibold text-gray-900">
        <Users className="h-4 w-4 text-gray-400" aria-hidden />
        Create a class at once
      </h2>
      <p className="mt-0.5 text-sm text-gray-400">Up to 200 accounts per batch. Aliases that already exist are skipped, not changed.</p>

      <div role="tablist" aria-label="How to create" className="mt-4 inline-flex rounded-full border border-black/[0.04] p-1" style={{ background: "rgba(15,23,42,0.04)" }}>
        {(["series", "list"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-200",
              mode === m ? "bg-white text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]" : "text-gray-500 hover:text-gray-700"
            )}
          >
            {m === "series" ? "Numbered set" : "Paste a list"}
          </button>
        ))}
      </div>

      {mode === "series" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_110px_110px]">
          <label className="flex flex-col gap-1 text-[12.5px] font-medium text-gray-600">
            Prefix
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. maths7b" autoComplete="off" autoCapitalize="none" spellCheck={false} className={cn(INPUT, "font-mono")} />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium text-gray-600">
            How many
            <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Number(e.target.value))} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] font-medium text-gray-600">
            Start at
            <input type="number" min={0} value={start} onChange={(e) => setStart(Number(e.target.value))} className={INPUT} />
          </label>
          {preview && <p className="text-[12.5px] text-gray-400 sm:col-span-3">Creates <span className="font-mono text-gray-600">{preview}</span></p>}
        </div>
      ) : (
        <label className="mt-4 flex flex-col gap-1 text-[12.5px] font-medium text-gray-600">
          One alias per line (avoid real names)
          <textarea value={list} onChange={(e) => setList(e.target.value)} rows={6} placeholder={"maths7b-01\nmaths7b-02\nmaths7b-03"} spellCheck={false} className={cn(INPUT, "resize-y font-mono")} />
        </label>
      )}

      <button
        type="button"
        onClick={create}
        disabled={pending || (mode === "series" ? !prefix.trim() || count < 1 : !list.trim())}
        className="mt-4 flex h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {pending && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
        {pending ? "Creating accounts…" : "Create accounts"}
      </button>

      {outcome && !outcome.ok && (
        <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{outcome.error}</div>
      )}

      {outcome?.ok && (
        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/50 p-4" role="status">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-gray-900">
                Created {created.length} account{created.length === 1 ? "" : "s"}
                {skipped.length > 0 && <span className="font-normal text-gray-500"> · {skipped.length} skipped</span>}
              </p>
              <p className="mt-0.5 text-[12.5px] text-gray-500">These passwords are shown once. Save or print them now.</p>
            </div>
            <button type="button" onClick={() => setOutcome(null)} aria-label="Hide these details" className="-m-1 rounded-lg p-1 text-gray-400 hover:bg-white/70 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>

          {created.length > 0 && (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  { label: copied ? "Copied" : "Copy all", icon: copied ? Check : Copy, onClick: copyAll },
                  { label: "Download CSV", icon: Download, onClick: () => downloadCsv(created) },
                  { label: "Print slips", icon: Printer, onClick: () => printSlips(created) },
                ].map(({ label, icon: Icon, onClick }) => (
                  <button key={label} type="button" onClick={onClick} className="btn-press flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-gray-700 hover:bg-gray-50">
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-gray-100 bg-white">
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 bg-gray-50 text-[11.5px] uppercase tracking-wide text-gray-400">
                    <tr><th className="px-3 py-2 font-semibold">Alias</th><th className="px-3 py-2 font-semibold">Temporary password</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-mono text-gray-900">
                    {created.map((r) => (
                      <tr key={r.alias}><td className="px-3 py-1.5">{r.alias}</td><td className="px-3 py-1.5">{r.password}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {(skipped.length > 0 || outcome.invalid.length > 0) && (
            <div className="mt-3 text-[12.5px] text-gray-500">
              {skipped.length > 0 && <p>Skipped: {skipped.map((s) => `${s.alias} (${s.error.toLowerCase()})`).join(", ")}</p>}
              {outcome.invalid.length > 0 && <p>Not valid aliases (ignored): {outcome.invalid.join(", ")}</p>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
