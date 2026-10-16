"use server"

import { revalidatePath } from "next/cache"
import { requireAuthConfig } from "@/lib/auth/config"
import { requireAdmin } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/server"
import {
  AliasAdminError,
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

export async function createAliasAction(alias: string) {
  return run((domain) => createAliasAccount(createAdminClient(), alias, domain))
}

export async function resetAliasPasswordAction(alias: string) {
  return run((domain) => resetAliasPassword(createAdminClient(), alias, domain))
}

export async function deleteAliasAction(alias: string) {
  return run((domain) => deleteAliasAccount(createAdminClient(), alias, domain))
}
