"use client"

import { useState, useTransition } from "react"
import { Check, Copy, KeyRound, Plus, Search, Trash2, UserRound, X } from "lucide-react"
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
import { RelativeTime } from "@/components/dashboard/relative-time"
import { createAliasAction, deleteAliasAction, resetAliasPasswordAction, type AliasActionResult } from "@/app/admin/actions"
import type { AliasAccount } from "@/lib/auth/alias-admin"
import { isValidAlias, normalizeAlias } from "@/lib/auth/identity"

interface Issued {
  alias: string
  password: string
  kind: "created" | "reset"
}

/** Shows a temporary password exactly once, with a copy button. */
function IssuedCard({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Alias: ${issued.alias}\nTemporary password: ${issued.password}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be blocked; the details stay on screen to copy by hand.
    }
  }
  return (
    <div role="status" className="animate-rise-in rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-semibold text-gray-900">
          {issued.kind === "created" ? "Alias created" : "Password reset"}. Give these to the student:
        </p>
        <button type="button" onClick={onClose} aria-label="Hide these details" className="-m-1 rounded-lg p-1 text-gray-400 hover:bg-white/70 hover:text-gray-700">
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
        <dt className="text-gray-500">Alias</dt>
        <dd className="font-mono font-semibold text-gray-900">{issued.alias}</dd>
        <dt className="text-gray-500">Temporary password</dt>
        <dd className="font-mono font-semibold text-gray-900">{issued.password}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={copy}
          className="btn-press flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy both"}
        </button>
        <p className="text-[12.5px] leading-snug text-gray-500">
          This password is shown once. The student signs in at <span className="font-medium text-gray-700">Sign in with a student alias</span> and then chooses their own.
        </p>
      </div>
    </div>
  )
}

type Pending = { kind: "reset" | "delete"; alias: string } | null

export function AliasManager({ aliases }: { aliases: AliasAccount[] }) {
  const [draft, setDraft] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [confirm, setConfirm] = useState<Pending>(null)
  const [filter, setFilter] = useState("")
  const [creating, startCreate] = useTransition()
  const [working, startWork] = useTransition()

  const normalized = normalizeAlias(draft)
  const draftProblem =
    draft && !isValidAlias(normalized)
      ? "Use 3–32 lowercase letters or numbers, with single . _ or - between them."
      : null
  const shown = filter ? aliases.filter((a) => a.alias.includes(filter.trim().toLowerCase())) : aliases

  function handle(result: AliasActionResult, kind: Issued["kind"] | "deleted") {
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    if (kind !== "deleted" && result.password) setIssued({ alias: result.alias, password: result.password, kind })
  }

  function create(e: React.FormEvent) {
    e.preventDefault()
    if (!normalized || draftProblem) return
    startCreate(async () => {
      const result = await createAliasAction(normalized)
      handle(result, "created")
      if (result.ok) setDraft("")
    })
  }

  function runConfirmed() {
    if (!confirm) return
    const { kind, alias } = confirm
    startWork(async () => {
      if (kind === "reset") handle(await resetAliasPasswordAction(alias), "reset")
      else {
        const result = await deleteAliasAction(alias)
        handle(result, "deleted")
        if (result.ok && issued?.alias === alias) setIssued(null)
      }
      setConfirm(null)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
        <h2 className="text-[16px] font-semibold text-gray-900">Create a student alias</h2>
        <p className="mt-0.5 text-sm text-gray-400">
          For students without a personal email. Avoid real names; something like <span className="font-mono text-gray-500">maths7b-01</span> works well.
        </p>
        <form onSubmit={create} noValidate className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label htmlFor="new-alias" className="sr-only">
              New alias
            </label>
            <div className="relative">
              <UserRound aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" strokeWidth={1.6} />
              <input
                id="new-alias"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. maths7b-01"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={draftProblem ? true : undefined}
                aria-describedby={draftProblem ? "new-alias-error" : undefined}
                className={cn(
                  "w-full rounded-2xl border bg-white/50 py-3 pl-11 pr-4 font-mono text-[15px] text-gray-900 placeholder:font-sans placeholder-gray-400 transition-all duration-150 focus:bg-white/80 focus:outline-none focus:ring-4",
                  draftProblem ? "border-red-300 focus:border-red-400 focus:ring-red-500/10" : "border-black/[0.08] focus:border-blue-500 focus:ring-blue-500/15"
                )}
              />
            </div>
            {draftProblem && (
              <p id="new-alias-error" className="mt-1.5 px-1 text-[13px] text-red-600">
                {draftProblem}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={creating || !normalized || Boolean(draftProblem)}
            className="flex h-[50px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition-all duration-150 hover:-translate-y-px hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {creating ? (
              <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            )}
            {creating ? "Creating…" : "Create alias"}
          </button>
        </form>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {issued && <IssuedCard issued={issued} onClose={() => setIssued(null)} />}

      <section aria-labelledby="aliases-heading">
        <div className="mb-3 mt-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="aliases-heading" className="text-[13px] font-semibold uppercase tracking-[0.04em] text-gray-400">
            Student aliases <span className="ml-1 font-normal normal-case tracking-normal">{aliases.length}</span>
          </h2>
          {aliases.length > 6 && (
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Find an alias"
                aria-label="Find an alias"
                className="w-48 rounded-xl border border-black/[0.08] bg-white py-1.5 pl-8 pr-3 text-[13px] focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15"
              />
            </div>
          )}
        </div>

        {aliases.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center">
            <p className="text-[15px] font-medium text-gray-700">No student aliases yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-400">Aliases you create will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white">
            {shown.map((a) => (
              <li key={a.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[14.5px] font-medium text-gray-900">{a.alias}</span>
                  <span className="block text-[12.5px] text-gray-400">
                    {a.lastSignInAt ? <RelativeTime iso={a.lastSignInAt} prefix="Last signed in " /> : "Never signed in"}
                  </span>
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    a.pendingPasswordChange ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"
                  )}
                >
                  {a.pendingPasswordChange ? "Temporary password" : "Active"}
                </span>
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: "reset", alias: a.alias })}
                    className="tap-target flex items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 sm:min-h-8"
                  >
                    <KeyRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    Reset password
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: "delete", alias: a.alias })}
                    aria-label={`Delete ${a.alias}`}
                    className="tap-target flex items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 sm:h-8 sm:min-h-8 sm:w-8 sm:min-w-8"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </span>
              </li>
            ))}
            {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No aliases match &ldquo;{filter}&rdquo;.</li>}
          </ul>
        )}
      </section>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && !working && setConfirm(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-semibold text-gray-900">
              {confirm?.kind === "delete" ? `Delete ${confirm.alias}?` : `Reset ${confirm?.alias}'s password?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "delete"
                ? "The account and all of its whiteboards will be permanently deleted. This can't be undone."
                : "They'll be signed out everywhere and get a new temporary password, which you'll see once."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="rounded-b-2xl">
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runConfirmed}
              disabled={working}
              className={confirm?.kind === "delete" ? "bg-red-600 text-white hover:bg-red-700" : undefined}
            >
              {working ? "Working…" : confirm?.kind === "delete" ? "Delete" : "Reset password"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
