import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { readAuthConfig } from "@/lib/auth/config"
import { safeNextPath } from "@/lib/auth/identity"

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "email", "recovery", "invite", "email_change", "magiclink"]

/**
 * Landing point for links in Supabase emails (verify sign-up, reset password).
 * Handles both the `token_hash` template style (works on any device) and the
 * default PKCE `code` style (works in the browser that started the flow).
 *
 * A `token_hash` link is not used here: opening it only shows a button
 * (/confirm-email), because mail scanners open every link in an email first
 * and would otherwise use it up before the student clicks.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const code = searchParams.get("code")
  const fallback = type === "recovery" ? "/reset-password" : "/dashboard"
  const next = safeNextPath(searchParams.get("next"), fallback)
  const recovery = type === "recovery" || next === "/reset-password"

  const fail = (reason: string) => {
    const url = new URL(recovery ? "/forgot-password" : "/sign-in", request.url)
    // A sign-up link that was already used (often by a mail scanner) has still confirmed the email.
    url.searchParams.set("error", reason === "link_invalid" && !recovery ? "link_used" : reason)
    return NextResponse.redirect(url)
  }

  if (!readAuthConfig()) return fail("not_configured")

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const url = new URL("/confirm-email", request.url)
    url.search = new URLSearchParams({ token_hash: tokenHash, type, next }).toString()
    return NextResponse.redirect(url)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return fail("link_invalid")
    return NextResponse.redirect(new URL(next, request.url))
  }

  return fail("link_invalid")
}
