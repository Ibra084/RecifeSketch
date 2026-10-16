import type { NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Everything except Next internals, static files and the dev-only drawing harness.
    "/((?!_next/static|_next/image|favicon.ico|dev/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|woff2?)$).*)",
  ],
}
