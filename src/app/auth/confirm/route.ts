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
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const code = searchParams.get("code")
  const fallback = type === "recovery" ? "/reset-password" : "/dashboard"
  const next = safeNextPath(searchParams.get("next"), fallback)

  const fail = (reason: string) => {
    const url = new URL(type === "recovery" || next === "/reset-password" ? "/forgot-password" : "/sign-in", request.url)
    url.searchParams.set("error", reason)
    return NextResponse.redirect(url)
  }

  if (!readAuthConfig()) return fail("not_configured")
  const supabase = await createClient()

  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) return fail("link_invalid")
    return NextResponse.redirect(new URL(next, request.url))
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return fail("link_invalid")
    return NextResponse.redirect(new URL(next, request.url))
  }

  return fail("link_invalid")
}
