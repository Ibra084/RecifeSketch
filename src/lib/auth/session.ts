import "server-only"
import { cache } from "react"
import { notFound, redirect } from "next/navigation"
import { connection } from "next/server"
import type { User } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { readAuthConfig } from "./config"
import { aliasFromEmail, type AccountType } from "./identity"

/** The narrow view of the signed-in student that pages and actions use. */
export interface CurrentUser {
  id: string
  accountType: AccountType
  /** Personal email (personal accounts only). */
  email: string | null
  /** Administrator-issued handle (alias accounts only). */
  alias: string | null
  /** Alias accounts must replace their temporary password before using the app. */
  mustChangePassword: boolean
  /** May manage student alias accounts at /admin. Never true for alias accounts. */
  isAdmin: boolean
}

/**
 * `app_metadata` can only be written with the service role, so it (not the
 * student-writable `user_metadata`) is what decides the account type and role.
 */
export function toCurrentUser(user: User, aliasDomain: string): CurrentUser {
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>
  const alias = user.email ? aliasFromEmail(user.email, aliasDomain) : null
  const isAlias = meta.account_type === "alias" && alias !== null
  return {
    id: user.id,
    accountType: isAlias ? "alias" : "personal",
    email: isAlias ? null : (user.email ?? null),
    alias: isAlias ? alias : null,
    mustChangePassword: isAlias && meta.must_change_password === true,
    isAdmin: !isAlias && alias === null && meta.role === "admin",
  }
}

/**
 * Verifies the session with Supabase Auth (getUser hits the Auth server, so
 * a forged or revoked cookie fails here) and returns the narrow user, or null.
 * Cached per request, so several components can ask without extra round trips.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const config = readAuthConfig()
  if (!config) return null
  // Supabase checks token expiry against the current time, which Next won't
  // allow while prerendering (partial prefetching renders with cookies).
  // The session is per-request anyway, so opt into request time explicitly.
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return toCurrentUser(data.user, config.aliasEmailDomain)
})

/** For pages behind sign-in: redirects instead of returning null. */
export async function requireUser(options: { allowPendingPasswordChange?: boolean } = {}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (user.mustChangePassword && !options.allowPendingPasswordChange) redirect("/change-password")
  return user
}

/** For the admin page and its actions. Non-admins get a plain 404, not a hint that it exists. */
export async function requireAdmin() {
  const user = await requireUser()
  if (!user.isAdmin) notFound()
  return user
}
