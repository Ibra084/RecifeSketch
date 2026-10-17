import "server-only"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { AuthNotConfiguredError, readServiceRoleKey, requireAuthConfig } from "@/lib/auth/config"

/**
 * Supabase client bound to the current request's session cookies. Database
 * calls made through it run as the signed-in student, so row-level security
 * is what limits them to their own whiteboards.
 */
export async function createClient() {
  const { supabaseUrl, supabaseAnonKey } = requireAuthConfig()
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components can't set cookies; the proxy refreshes the
          // session on every request, so this is safe to ignore there.
        }
      },
    },
  })
}

/**
 * Privileged client (service role). Bypasses row-level security, so it is
 * only used for narrow account-management steps the student can't perform
 * on their own row (clearing the alias first-login flag, deleting an
 * account, reading the blocked-domain list). Never pass its results to the
 * client wholesale.
 */
export function createAdminClient() {
  const { supabaseUrl } = requireAuthConfig()
  const serviceRoleKey = readServiceRoleKey()
  if (!serviceRoleKey) throw new AuthNotConfiguredError()
  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
