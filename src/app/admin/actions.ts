"use server"

import { revalidatePath } from "next/cache"
import { requireAuthConfig } from "@/lib/auth/config"
import { requireAdmin } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/server"
import {
  AliasAdminError,
  aliasSeries,
  createAliasAccounts,
  parseAliasList,
  type BulkAliasResult,
  createAliasAccount,
  deleteAliasAccount,
  resetAliasPassword,
} from "@/lib/auth/alias-admin"

export type AliasActionResult =
  | { ok: true; alias: string; password?: string }
  | { ok: false; error: string }

// Server actions are public endpoints: each one re-checks that the caller
// is an admin before touching anything, regardless of what the page showed.
async function run(fn: (aliasDomain: string) => Promise<{ alias: string; password?: string }>): Promise<AliasActionResult> {
  await requireAdmin()
  try {
    const result = await fn(requireAuthConfig().aliasEmailDomain)
    revalidatePath("/admin")
    return { ok: true, ...result }
  } catch (err) {
    if (err instanceof AliasAdminError) return { ok: false, error: err.message }
    console.error("[admin] alias action failed", err)
    return { ok: false, error: "Something went wrong. Please try again." }
  }
}

export type BulkAliasInput =
  | { mode: "series"; prefix: string; count: number; start: number }
  | { mode: "list"; text: string }

export type BulkAliasActionResult =
  | { ok: true; results: BulkAliasResult[]; invalid: string[] }
  | { ok: false; error: string }

/** Creates a whole class's alias accounts at once: a numbered series, or a pasted list. */
export async function createAliasesAction(input: BulkAliasInput): Promise<BulkAliasActionResult> {
  await requireAdmin()
  try {
    const { aliases, invalid } = input.mode === "series"
      ? { aliases: aliasSeries(input.prefix, input.count, input.start), invalid: [] }
      : parseAliasList(input.text)
    if (aliases.length === 0) return { ok: false, error: invalid.length ? "None of those are valid aliases." : "Add at least one alias." }
    const results = await createAliasAccounts(createAdminClient(), aliases, requireAuthConfig().aliasEmailDomain)
    revalidatePath("/admin")
    return { ok: true, results, invalid }
  } catch (err) {
    if (err instanceof AliasAdminError) return { ok: false, error: err.message }
    console.error("[admin] bulk alias creation failed", err)
    return { ok: false, error: "Something went wrong. Some accounts may have been created - check the list below." }
  }
}

export async function createAliasAction(alias: string) {
  return run((domain) => createAliasAccount(createAdminClient(), alias, domain))
}

export async function resetAliasPasswordAction(alias: string) {
  return run((domain) => resetAliasPassword(createAdminClient(), alias, domain))
}

export async function deleteAliasAction(alias: string) {
  return run((domain) => deleteAliasAccount(createAdminClient(), alias, domain))
}
