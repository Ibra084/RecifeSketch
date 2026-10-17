import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

const AUTH_PAGES = ["/sign-in", "/sign-up", "/alias", "/forgot-password", "/check-email"]
const PUBLIC_PAGES = [...AUTH_PAGES, "/auth/confirm", "/terms", "/privacy"]

function matches(pathname: string, paths: readonly string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** The landing page is public, and signed-in students see it too (with dashboard CTAs). */
const isLanding = (pathname: string) => pathname === "/"

/**
 * Refreshes the Supabase session cookie on every request and performs the
 * *optimistic* redirects (signed-out → /sign-in, signed-in → away from auth
 * pages, alias with a temporary password → /change-password). Pages,
 * actions and route handlers still re-verify the user themselves.
 */
export async function updateSession(request: NextRequest) {
  const url = process.env.SUPABASE_URL?.trim()
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim()
  const { pathname } = request.nextUrl

  if (!url || !anonKey) {
    // Without Supabase nothing can sign in; keep students on the auth pages,
    // which explain that the app isn't configured yet.
    if (isLanding(pathname) || matches(pathname, PUBLIC_PAGES)) return NextResponse.next({ request })
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "auth_not_configured" }, { status: 503 })
    }
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value)
      },
    },
  })

  // getClaims verifies the JWT (and refreshes an expired session through
  // setAll above). Don't run code between createServerClient and this call.
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const signedIn = Boolean(claims?.sub)
  const appMeta = (claims?.app_metadata ?? {}) as Record<string, unknown>
  const mustChangePassword = appMeta.account_type === "alias" && appMeta.must_change_password === true

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url))
    // Carry refreshed session cookies across the redirect.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }

  if (pathname.startsWith("/api/")) {
    if (!signedIn) return NextResponse.json({ error: "unauthenticated" }, { status: 401 })
    if (mustChangePassword) return NextResponse.json({ error: "password_change_required" }, { status: 403 })
    return response
  }

  if (!signedIn) {
    if (isLanding(pathname) || matches(pathname, PUBLIC_PAGES)) return response
    const target = new URL("/sign-in", request.url)
    if (pathname !== "/dashboard") target.searchParams.set("next", pathname)
    const redirect = NextResponse.redirect(target)
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }

  if (mustChangePassword && pathname !== "/change-password") return redirectTo("/change-password")
  if (matches(pathname, AUTH_PAGES)) return redirectTo("/dashboard")
  return response
}
