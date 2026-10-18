import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

let claims: Record<string, unknown> | null = null
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: async () => ({ data: claims ? { claims } : null }) } }),
}))

const { updateSession } = await import("./proxy")

const req = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"))
const location = (res: Response) => {
  const value = res.headers.get("location")
  return value ? new URL(value).pathname + new URL(value).search : null
}

describe("updateSession (configured)", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    claims = null
  })

  it("sends signed-out students to sign-in, remembering where they were going", async () => {
    expect(location(await updateSession(req("/board/abc")))).toBe("/sign-in?next=%2Fboard%2Fabc")
    expect(location(await updateSession(req("/dashboard")))).toBe("/sign-in")
  })

  it("leaves public pages reachable when signed out", async () => {
    for (const path of ["/", "/sign-in", "/sign-up", "/alias", "/forgot-password", "/terms", "/auth/confirm", "/confirm-email"]) {
      expect(location(await updateSession(req(path)))).toBeNull()
    }
  })

  it("rejects signed-out API calls with 401", async () => {
    expect((await updateSession(req("/api/tutor"))).status).toBe(401)
  })

  it("moves signed-in students off the auth pages", async () => {
    claims = { sub: "u1", app_metadata: {} }
    expect(location(await updateSession(req("/sign-in")))).toBe("/dashboard")
    // The landing page stays visible to signed-in students (it shows dashboard CTAs).
    expect(location(await updateSession(req("/")))).toBeNull()
    expect(location(await updateSession(req("/board/abc")))).toBeNull()
  })

  it("holds an alias with a temporary password on /change-password", async () => {
    claims = { sub: "u1", app_metadata: { account_type: "alias", must_change_password: true } }
    expect(location(await updateSession(req("/dashboard")))).toBe("/change-password")
    expect(location(await updateSession(req("/change-password")))).toBeNull()
    expect((await updateSession(req("/api/tutor"))).status).toBe(403)
  })
})

describe("updateSession (not configured)", () => {
  it("keeps everything behind the auth pages and fails APIs closed", async () => {
    vi.stubEnv("SUPABASE_URL", "")
    expect(location(await updateSession(req("/dashboard")))).toBe("/sign-in")
    expect(location(await updateSession(req("/sign-in")))).toBeNull()
    expect(location(await updateSession(req("/")))).toBeNull()
    expect((await updateSession(req("/api/tutor"))).status).toBe(503)
    vi.unstubAllEnvs()
  })
})
