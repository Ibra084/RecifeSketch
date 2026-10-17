import "server-only"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * Reads the configurable blocked-domain list from `public.blocked_email_domains`
 * (the same table the Supabase before-user-created hook enforces). Throws if
 * the list can't be read, so sign-up fails closed rather than letting a
 * school address through.
 */
export async function loadBlockedEmailDomains(): Promise<string[]> {
  const { data, error } = await createAdminClient().from("blocked_email_domains").select("domain")
  if (error) throw new Error(`Could not load blocked email domains: ${error.message}`)
  return (data ?? []).map((row) => String(row.domain))
}
